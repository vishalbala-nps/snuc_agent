from datetime import *
def get_current_date() -> str:
    return str(datetime.now().strftime("%Y/%m/%d"))