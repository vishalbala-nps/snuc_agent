from google.adk.agents.llm_agent import Agent
from google.adk.models.lite_llm import LiteLlm
import configparser
import os

from . import prompts
from .tools import *

def getModel() -> LiteLlm | str:
    config = configparser.ConfigParser()
    files_read = config.read("config.ini")
    if not files_read:
        raise FileNotFoundError("Configuration not present! Cannot start agent")

    if not config.has_section("model"):
        raise FileNotFoundError("Model not configured! Cannot start agent")
    modelConfig = config["model"]

    model_type = modelConfig.get("model")
    variant = modelConfig.get("variant")
    key = modelConfig.get("key")
    if model_type == "gemini":
        if not key:
            raise ValueError("API key not configured! Cannot start agent")
        os.environ["GOOGLE_API_KEY"] = key
        return variant
    elif model_type == "ollama":
        return LiteLlm("ollama_chat/" + variant, additional_args={"think": False})
    else:
        raise ValueError("Unsupported model! Cannot start agent")

model = getModel()

# The static/dynamic instruction split only benefits Gemini (context caching);
# local models handle a single merged system instruction more reliably.
is_gemini = isinstance(model, str)

root_agent = Agent(
    model=model,
    name='root_agent',
    description='A helpful assistant for user questions.',
    static_instruction=prompts.STATIC_INSTRUCTION if is_gemini else None,
    instruction=prompts.DYNAMIC_INSTRUCTION if is_gemini else prompts.STATIC_INSTRUCTION + prompts.DYNAMIC_INSTRUCTION,
    tools=[
        get_moodle_details,
        get_digiicampus_details,
        get_digiicampus_posts,
        get_digiicampus_user_details,
        get_active_term,
        get_attendance,
        get_mentor_details
    ]
)