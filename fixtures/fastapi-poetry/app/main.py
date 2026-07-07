from fastapi import FastAPI

from app.models import Item
from .db import get_db

app = FastAPI()


@app.get("/items")
def list_items():
    _ = get_db()
    return [Item("x", 1).sku]
