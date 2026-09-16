"""Archive recognition for the TikTok platform accepts any export that holds at
least one section the extractors read, and rejects one that holds none.

The known-file lists mirror packages/mobile-tiktok/src/archive.ts TXT_FILES
(ADR-0041 parity); the two sets below are the single source for both sides."""
import io
import zipfile

import pytest

from port.helpers.validate import validate_zip
from port.platforms.tiktok import DDP_CATEGORIES

EN_WANTED = {
    "Activity Summary.txt", "Watch History.txt", "Favorite Videos.txt", "Follower.txt",
    "Following.txt", "Like List.txt", "Comments.txt", "Profile Information.txt",
}
NL_WANTED = {
    "Samenvatting van activiteit.txt", "Kijkgeschiedenis.txt", "Favoriete video's.txt",
    "Volger.txt", "Volgend.txt", "Likelijst.txt", "Reacties.txt", "Profielinformatie.txt",
}

SENTINEL = "You have no data in this section\n"


def zip_of(*members: str) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for m in members:
            z.writestr(m, "{}" if m.endswith(".json") else SENTINEL)
    buf.seek(0)
    return buf


def category(buf: io.BytesIO):
    v = validate_zip(DDP_CATEGORIES, buf)
    return v.current_ddp_category.id, v.get_status_code_id()


def test_known_files_are_exactly_the_wanted_basenames():
    by_id = {c.id: set(c.known_files) for c in DDP_CATEGORIES}
    assert by_id["txt_en"] == EN_WANTED
    assert by_id["txt_nl"] == NL_WANTED
    assert by_id["json_en"] == {"user_data.json", "user_data_tiktok.json"}


def test_four_section_english_export_is_txt_en():
    buf = zip_of(
        "TikTok/Your Activity/Watch History.txt", "TikTok/Your Activity/Activity Summary.txt",
        "TikTok/Likes and Favorites/Like List.txt", "TikTok/Likes and Favorites/Favorite Videos.txt",
        "TikTok/Comments/Comments.txt", "TikTok/Profile and Settings/Follower.txt",
        "TikTok/Profile and Settings/Following.txt", "TikTok/Profile and Settings/Profile Information.txt",
    )
    assert category(buf) == ("txt_en", 0)


def test_comments_only_export_is_accepted():
    assert category(zip_of("TikTok/Comments/Comments.txt")) == ("txt_en", 0)


def test_reacties_only_export_is_accepted_as_dutch():
    assert category(zip_of("TikTok/Reacties/Reacties.txt")) == ("txt_nl", 0)


def test_export_with_only_dropped_sections_is_rejected():
    buf = zip_of("TikTok/Your Activity/Searches.txt", "TikTok/Profile and Settings/Settings.txt")
    assert category(buf)[1] != 0


def test_json_export_is_json_en():
    assert category(zip_of("user_data_tiktok.json")) == ("json_en", 0)
