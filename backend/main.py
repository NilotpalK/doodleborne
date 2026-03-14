import os
import re
import json
from io import BytesIO

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image

load_dotenv()

# ── Gemini setup ─────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in .env")

client = genai.Client(api_key=GEMINI_API_KEY)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Doodleborne API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Synonym map ───────────────────────────────────────────────────────────────
SYNONYM_MAP: dict[str, str] = {
    # car
    "car": "car", "sports car": "car", "vehicle": "car", "automobile": "car",
    "truck": "car", "suv": "car", "van": "car", "jeep": "car", "taxi": "car",
    "bus": "car", "pickup truck": "car", "race car": "car", "go-kart": "car",
    # rocket
    "rocket": "rocket", "space shuttle": "rocket", "missile": "rocket",
    "spacecraft": "rocket", "spaceship": "rocket", "rocket ship": "rocket",
    # airplane
    "airplane": "airplane", "plane": "airplane", "aeroplane": "airplane",
    "jet": "airplane", "fighter jet": "airplane", "biplane": "airplane",
    "aircraft": "airplane",
    # helicopter
    "helicopter": "helicopter", "chopper": "helicopter", "heli": "helicopter",
    # bird
    "bird": "bird", "eagle": "bird", "parrot": "bird", "sparrow": "bird",
    "pigeon": "bird", "owl": "bird", "hawk": "bird", "seagull": "bird",
    "duck": "bird", "crow": "bird", "flamingo": "bird", "penguin": "bird",
    # ball
    "ball": "ball", "football": "ball", "soccer ball": "ball",
    "basketball": "ball", "tennis ball": "ball", "baseball": "ball",
    "rugby ball": "ball", "sphere": "ball",
    # boat
    "boat": "boat", "ship": "boat", "sailboat": "boat", "yacht": "boat",
    "canoe": "boat", "kayak": "boat", "ferry": "boat", "rowboat": "boat",
    "submarine": "boat",
    # fish
    "fish": "fish", "shark": "fish", "whale": "fish", "dolphin": "fish",
    "clownfish": "fish", "goldfish": "fish", "tuna": "fish",
    # person
    "person": "person", "stick figure": "person", "human": "person",
    "man": "person", "woman": "person", "boy": "person", "girl": "person",
    "character": "person", "figure": "person", "stickman": "person",
    # ufo
    "ufo": "ufo", "flying saucer": "ufo", "alien ship": "ufo",
    "alien spacecraft": "ufo",
    # sun
    "sun": "sun", "sunshine": "sun",
    # cloud
    "cloud": "cloud", "clouds": "cloud", "storm cloud": "cloud",
    # tree
    "tree": "tree", "pine tree": "tree", "oak tree": "tree",
    "palm tree": "tree", "plant": "tree", "bush": "tree",
    # star
    "star": "star", "shooting star": "star", "sparkle": "star",
    # fire
    "fire": "fire", "campfire": "fire", "flame": "fire", "bonfire": "fire",
    "candle": "fire",
}

MOVABLE_PRESETS = {
    "car", "rocket", "airplane", "helicopter",
    "bird", "ball", "boat", "fish", "person", "ufo",
}
AMBIENT_PRESETS = {"sun", "cloud", "tree", "star", "fire"}

# ── Prompt ────────────────────────────────────────────────────────────────────
IDENTIFY_PROMPT = """This is a hand-drawn sketch made by a user.

1. What is the most likely object this sketch represents? Give a single short label (e.g. "car", "rocket", "bird").
2. Classify the object as one of:
   - "movable": things that logically move under user keyboard control (vehicles, animals, characters, sports objects, flying things)
   - "ambient": things that exist in an environment but don't move by user input (sun, moon, star, tree, cloud, building, mountain, fire, flower)
   - "unsure": if you genuinely cannot tell
3. What direction is the object FACING in the sketch? Answer with one of: "right", "left", "up", "down", "none"
   - "right": object points / faces to the right (e.g. a car driving right, a rocket pointing right)
   - "left": object faces left
   - "up": object faces upward (e.g. a rocket pointing up)
   - "down": object faces downward
   - "none": direction is not meaningful (ball, sun, tree)
4. Where is the object's exhaust, tail, or propulsion point? Answer with one of: "left", "right", "top", "bottom", "none"
   - This is the OPPOSITE of the facing direction (exhaust is at the back/tail)
   - For a rocket facing up: exhaust_side is "bottom"
   - For a car facing right: exhaust_side is "left" (tailpipe at the back)
   - "none" for objects with no propulsion (ball, tree, sun)

Return ONLY valid JSON in this format, nothing else:
{ "object": "<label>", "category": "movable" | "ambient" | "unsure", "facing": "right" | "left" | "up" | "down" | "none", "exhaust_side": "left" | "right" | "top" | "bottom" | "none" }"""

# ── Response model ────────────────────────────────────────────────────────────
class IdentifyResponse(BaseModel):
    object: str
    category: str        # "movable" | "ambient" | "unsure"
    preset: str | None   # resolved preset key, or null if no match
    facing: str          # "right" | "left" | "up" | "down" | "none"
    exhaust_side: str    # "left" | "right" | "top" | "bottom" | "none"

# ── Helper: resolve preset ────────────────────────────────────────────────────
def resolve_preset(obj_label: str, ai_category: str) -> tuple[str | None, str]:
    preset = SYNONYM_MAP.get(obj_label)
    if preset in MOVABLE_PRESETS:
        category = "movable"
    elif preset in AMBIENT_PRESETS:
        category = "ambient"
    else:
        category = ai_category
    return preset, category

# ── Endpoint ──────────────────────────────────────────────────────────────────
@app.post("/identify", response_model=IdentifyResponse)
async def identify(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()

    # Validate + load image
    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Call Gemini 2.0 Flash
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_text(text=IDENTIFY_PROMPT),
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    raw = response.text.strip() if response.text else ""

    # Extract JSON (handles markdown code fences if model wraps output)
    json_match = re.search(r"\{.*?\}", raw, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=502, detail=f"Unexpected AI response: {raw}")

    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Failed to parse AI response: {raw}")

    obj_label    = data.get("object", "").lower().strip()
    ai_category  = data.get("category", "unsure").lower().strip()
    facing       = data.get("facing", "none").lower().strip()
    exhaust_side = data.get("exhaust_side", "none").lower().strip()

    # Validate enum values
    valid_facing   = {"right", "left", "up", "down", "none"}
    valid_exhaust  = {"left", "right", "top", "bottom", "none"}
    if facing not in valid_facing:       facing = "none"
    if exhaust_side not in valid_exhaust: exhaust_side = "none"

    # If Gemini didn't provide exhaust_side, derive it from facing
    if exhaust_side == "none" and facing != "none":
        exhaust_side = {"right": "left", "left": "right", "up": "bottom", "down": "top"}.get(facing, "none")

    preset, category = resolve_preset(obj_label, ai_category)

    return IdentifyResponse(
        object=obj_label,
        category=category,
        preset=preset,
        facing=facing,
        exhaust_side=exhaust_side,
    )


@app.get("/health")
def health():
    return {"status": "ok"}
