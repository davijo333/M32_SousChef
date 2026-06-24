"""MongoDB access for LangChain agent tools."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from bson import ObjectId
from pydantic_settings import BaseSettings, SettingsConfigDict
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database


class MongoSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MONGODB_URI: str = "mongodb://localhost:27017/sous_chef"


_mongo_settings = MongoSettings()


def parse_restaurant_id(restaurant_id: str) -> ObjectId:
    try:
        return ObjectId(restaurant_id)
    except Exception as exc:
        raise ValueError(f"Invalid restaurant_id: {restaurant_id}") from exc


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    return MongoClient(_mongo_settings.MONGODB_URI, serverSelectionTimeoutMS=5000)


def get_db() -> Database:
    return get_client().get_default_database()


def collection(name: str) -> Collection:
    return get_db()[name]


def find_many(
    coll_name: str,
    restaurant_id: str,
    projection: dict[str, int] | None = None,
    limit: int | None = None,
    sort: list[tuple[str, int]] | None = None,
    extra_filter: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    filt: dict[str, Any] = {"restaurantId": parse_restaurant_id(restaurant_id)}
    if extra_filter:
        filt.update(extra_filter)
    cursor = collection(coll_name).find(filt, projection)
    if sort:
        cursor = cursor.sort(sort)
    if limit is not None:
        cursor = cursor.limit(limit)
    return list(cursor)


def find_one(
    coll_name: str,
    restaurant_id: str,
    extra_filter: dict[str, Any],
    projection: dict[str, int] | None = None,
) -> dict[str, Any] | None:
    filt: dict[str, Any] = {"restaurantId": parse_restaurant_id(restaurant_id)}
    filt.update(extra_filter)
    return collection(coll_name).find_one(filt, projection)


def find_by_user(
    coll_name: str,
    user_id: str,
    *,
    projection: dict[str, int] | None = None,
    limit: int | None = None,
    sort: list[tuple[str, int]] | None = None,
    extra_filter: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    try:
        uid = ObjectId(user_id)
    except Exception as exc:
        raise ValueError(f"Invalid user_id: {user_id}") from exc
    filt: dict[str, Any] = {"userId": uid}
    if extra_filter:
        filt.update(extra_filter)
    cursor = collection(coll_name).find(filt, projection)
    if sort:
        cursor = cursor.sort(sort)
    if limit is not None:
        cursor = cursor.limit(limit)
    return list(cursor)


def update_one(
    coll_name: str,
    restaurant_id: str,
    extra_filter: dict[str, Any],
    update: dict[str, Any],
) -> bool:
    filt: dict[str, Any] = {"restaurantId": parse_restaurant_id(restaurant_id)}
    filt.update(extra_filter)
    result = collection(coll_name).update_one(filt, update)
    return result.modified_count > 0
