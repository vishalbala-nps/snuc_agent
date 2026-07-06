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
        return LiteLlm("ollama_chat/" + variant, num_ctx=16384)
    else:
        raise ValueError("Unsupported model! Cannot start agent")

model = getModel()
is_gemini = isinstance(model, str)

def clear_download_url(tool, args, tool_context):
    tool_context.state["DOWNLOAD_URL"] = ""
    return None

root_agent = Agent(
    model=model,
    name='root_agent',
    description='A helpful assistant for user questions.',
    static_instruction=prompts.STATIC_INSTRUCTION,
    before_tool_callback=clear_download_url,
    tools=[
        get_digiicampus_posts,
        get_outpass_requests,
        get_outpass_details,
        get_attendance,
        get_mentor_details,
        get_digiicampus_courses,
        get_digiicampus_course_modules,
        get_digiicampus_course_content,
        fetch_download_url
    ]
)