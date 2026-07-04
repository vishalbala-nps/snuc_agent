from google.adk.agents.llm_agent import Agent
from google.adk.models.lite_llm import LiteLlm
import configparser

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

    if model_type == "gemini":
        return variant
    elif model_type == "ollama":
        return LiteLlm("ollama_chat/" + variant, additional_args={"nothink": True})
    else:
        raise ValueError("Unsupported model! Cannot start agent")

root_agent = Agent(
    model=getModel(),
    name='root_agent',
    description='A helpful assistant for user questions.',
    instruction=prompts.SYSTEM_INSTRUCTION,
    tools=[get_current_date]
)