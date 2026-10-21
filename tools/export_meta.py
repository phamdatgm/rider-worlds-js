"""Export the meta-game data (cards, challenges, player rank, reward tracks, shop, boosters, texts) to
public/assets/meta.json.

Runs after export.py (card item prefabs/materials are exported there); it only needs the Unity YAML.
"""
import json
import os
import sys

from unity_yaml import ASSETS, load_file, guid_index, script_name

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "assets", "meta.json"))
gi = guid_index()


def rel_id(path):
    return os.path.splitext(os.path.relpath(path, ASSETS).replace("\\", "/"))[0]


def asset(rel):
    return os.path.join(ASSETS, rel)


def so(path):
    docs = load_file(path)
    return next(d["data"] for d in docs.values() if d["type"] == "MonoBehaviour")


def ref_path(ref):
    return gi.get((ref or {}).get("guid", "")) if isinstance(ref, dict) else None


def sprite(ref):
    """Sprite reference -> atlas sprite name (texture file name without extension)."""
    p = ref_path(ref)
    return os.path.splitext(os.path.basename(p))[0] if p else None


def uints(h):
    """Unity int arrays are serialized as little-endian int32 hex."""
    if isinstance(h, list):
        return [int(x) for x in h]
    h = str(h or "")
    return [int.from_bytes(bytes.fromhex(h[i:i + 8]), "little", signed=True) for i in range(0, len(h) - 7, 8)]


def ticks(v):
    return (int((v or {}).get("ticks", 0)) / 1e7) if isinstance(v, dict) else 0


def term(v):
    return (v or {}).get("mTerm") or "" if isinstance(v, dict) else ""


def reward_def(r):
    return {"id": ((r.get("rewardID") or {}).get("id")) or "", "amount": int(r.get("amount") or 0),
            "extra": str(r.get("extraData") if r.get("extraData") is not None else "")}


def item_ref(ref):
    p = ref_path(ref)
    if not p:
        return None
    if p.endswith(".prefab"):
        return {"$prefab": rel_id(p)}
    if p.endswith(".mat"):
        return {"$mat": rel_id(p)}
    return None


# ---------------------------------------------------------------- localization (English)

def localization():
    text = open(asset("Resources/I2Languages.asset"), encoding="utf-8").read()
    # the generic loader is slow for this file and English is simply the first entry under Languages
    loc = {}
    cur = None
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if s.startswith("- Term: "):
            cur = s[len("- Term: "):]
        elif s == "Languages:" and cur is not None:
            j = i + 1
            if j < len(lines) and lines[j].strip().startswith("- "):
                v = lines[j].strip()[2:]
                # multi-line plain scalars continue on more-indented lines
                ind = len(lines[j]) - len(lines[j].lstrip())
                k = j + 1
                while k < len(lines) and (len(lines[k]) - len(lines[k].lstrip())) > ind and not lines[k].strip().startswith("- "):
                    v += " " + lines[k].strip()
                    k += 1
                if v.startswith(("'", '"')):
                    try:
                        import yaml
                        v = yaml.safe_load(v)
                    except Exception:
                        v = v.strip("'\"")
                loc[cur] = str(v)
            cur = None
        i += 1
    return loc


# ---------------------------------------------------------------- cards

CARD_TYPES = {"VehicleCard": 10000, "VehicleColorCard": 20000, "VehicleTrailCard": 30000, "VehicleDeathCard": 31000,
              "VehicleLandingCard": 32000, "BoosterCard": 40000, "CurrencyCard": 1}


def card_type(cid):
    if 10000 <= cid <= 19999:
        return 10000
    if 20000 <= cid <= 29999:
        return 20000
    if 30000 <= cid <= 30999:
        return 30000
    if 31000 <= cid <= 31999:
        return 31000
    if 32000 <= cid <= 32999:
        return 32000
    if 40000 <= cid <= 49999:
        return 40000
    if 2000000000 < cid <= 2000009999:
        return 1
    return 0


def cards(loc):
    db = so(asset("MonoBehaviour/Cards.asset"))
    out = []
    for ref in db.get("assets") or []:
        p = ref_path(ref)
        if not p:
            continue
        d = so(p)
        cid = int(d.get("id", 0))
        lt = term(d.get("localizedLabel"))
        c = {"id": cid, "type": card_type(cid), "name": d.get("m_Name"), "rarity": int(d.get("rarity", 0)),
             "label": loc.get(lt) or d.get("label") or d.get("m_Name"), "canDrop": int(d.get("canDropRandomly", 0)),
             "world": int(d.get("world", 1) or 1), "image": sprite(d.get("image"))}
        if "items" in d:
            c["items"] = [item_ref(r) for r in d.get("items") or []]
            c["rankImages"] = [sprite(r) for r in d.get("rankImages") or []]
        if c["type"] == 40000:
            c["imageDisabled"] = sprite(d.get("imageDisabled"))
            c["nameTerm"] = term(d.get("localizedName")) or term(d.get("localizedLabel"))
            c["descTerm"] = term(d.get("effectDescription"))
        if c["type"] == 1:
            c["currencyPerCard"] = float(d.get("currencyPerCard", 1))
            c["icon"] = sprite(d.get("icon"))
            c["shopSizes"] = [{"min": int(s.get("minimalAmount", 0)), "icon": sprite(s.get("icon")),
                               "rarity": int(s.get("rarity", 0))} for s in d.get("shopSizes") or []]
        out.append(c)
    svc = so(asset("MonoBehaviour/Card Service.asset"))
    st = svc.get("settings") or {}
    ui = st.get("uiCardSettings") or {}
    rarity = []
    for r in ((ui.get("ui") or {}).get("data") or []):
        m = r.get("main") or {}
        rarity.append({"color": [m.get("r", 1), m.get("g", 1), m.get("b", 1)], "banner": sprite(r.get("bannerIcon"))})
    type_icons = {}
    td = ui.get("uiCardTypeData") or []
    for t in (td.get("data") or [] if isinstance(td, dict) else td):
        if isinstance(t, dict) and "type" in t:
            type_icons[int(t["type"])] = sprite(t.get("cardIcon"))
    return {"cards": out, "cardsNeeded": uints(st.get("cardsNeeded")), "excessDuplicatesCard": int(st.get("excessDuplicatesCard", 0)),
            "rarity": rarity, "typeIcons": type_icons}


# ---------------------------------------------------------------- challenges

def challenges(loc):
    worlds = []
    for w in (1, 2, 3):
        ws = so(asset(f"MonoBehaviour/World {w} Settings.asset"))
        cp = ref_path(ws.get("challengesCollection"))
        lst = []
        if cp:
            coll = so(cp)
            by_id = {}
            order = []
            for r in coll.get("assets") or []:
                p = ref_path(r)
                if not p:
                    continue
                d = so(p)
                by_id[str(d.get("uniqueChallengeID"))] = d
                order.append(str(d.get("uniqueChallengeID")))
            ordered = [str(x.get("_") if isinstance(x, dict) else x) for x in coll.get("challengeOrder") or []]
            seq = [i for i in ordered if i in by_id] + [i for i in order if i not in ordered]
            for cid in seq:
                d = by_id[cid]
                obj = d.get("objective") or {}
                cls = script_name(d)
                t = term(d.get("localizedDescription"))
                lst.append({
                    "id": cid, "cls": cls, "setup": int(obj.get("type", 0)),
                    "x": int((obj.get("x") or {}).get("min", 0)), "y": int((obj.get("y") or {}).get("min", 0)),
                    "z": int(obj.get("z", 0)), "inARow": int(obj.get("inARow", 0)), "hard": int(d.get("isHard", 0)),
                    "mode": int(d.get("tracksInRunMode", 1)), "minimalFlips": int(d.get("minimalFlips", 1) or 1),
                    "special": uints(d.get("specialRoadTypes"))[:1] if int(d.get("onSpecialRoad", 0)) else [],
                    "text": loc.get(t, t), "reward": [reward_def(r) for r in obj.get("reward") or []],
                })
        worlds.append(lst)
    s = so(asset("MonoBehaviour/Challenge Manager Settings.asset"))
    settings = {
        "slot1": int(s.get("slot1CompleteRequirement", 4)), "slot2": int(s.get("slot2CompleteRequirement", 8)),
        "normalReward": reward_def(s.get("normalBaseReward") or {}), "hardReward": reward_def(s.get("hardBaseReward") or {}),
        "allowSkipAfterRuns": int(s.get("allowSkipAfterRuns", 10)), "maxTimeout": ticks(s.get("worldChallengeMaxTimeout")),
        "world1Timeouts": [[int(t.get("untilChallenge", 0)), ticks(t.get("challengeTimeout"))] for t in s.get("world1ChallengeTimeouts") or []],
        "skipChallengeCost": int(s.get("skipChallengeHardCost", 25)), "skipTimerCost": int(s.get("skipTimerHardCost", 15)),
    }
    return {"worlds": worlds, "settings": settings}


# ---------------------------------------------------------------- rank / reward tracks / worlds

def track(rel):
    d = so(asset(rel))
    steps = []
    for st in d.get("steps") or []:
        r = reward_def(st)
        r["required"] = int(st.get("required", 0))
        r["sid"] = int(((st.get("id") or {}).get("_")) or st.get("index", 0))
        steps.append(r)
    return {"type": int(d.get("progressionType", 0)), "steps": steps, "rvGemMultiplier": float(d.get("rvGemMultiplier", 2) or 2)}


def rank():
    s = so(asset("MonoBehaviour/PlayerRankSettings.asset"))
    return {"bonusUnlockRank": int(s.get("bonusUnlockRank", 2)), "openChallengePopUpAutoUntilRank": int(s.get("openChallengePopUpAutoUntilRank", 1)),
            "worldNavigationUnlockRank": int(s.get("worldNavigationUnlockRank", 1)), "maxRank": int(s.get("maxRank", 38)),
            "stars": uints(s.get("stars")), "rankUnlockId": ((s.get("rankUnlockId") or {}).get("id")) or "UnlockReward"}


def worlds():
    out = []
    for w in (1, 2, 3):
        ws = so(asset(f"MonoBehaviour/World {w} Settings.asset"))
        vs = so(ref_path(ws.get("visualSettings"))) if ref_path(ws.get("visualSettings")) else {}
        out.append({"comingSoon": int(ws.get("isComingSoon", 0)), "mastery": int(ws.get("worldHighScoreMastery", 25)),
                    "icon": sprite(vs.get("worldSelectIcon")), "background": sprite(vs.get("worldSelectBackground")),
                    "transition": sprite(vs.get("worldTransitionBackground"))})
    return out


# ---------------------------------------------------------------- lootboxes / shop / daily lootbox / bonus

def lootboxes(loc):
    coll = so(asset("MonoBehaviour/_Lootboxes.asset"))
    boxes = {}
    for r in coll.get("assets") or []:
        p = ref_path(r)
        if not p:
            continue
        d = (so(p).get("definition") or {})
        bid = ((d.get("id") or {}).get("id")) or os.path.basename(p)
        slot = lambda s: {"dropper": ((s.get("dropper") or {}).get("id")) or "", "min": int(s.get("min", 1)),
                          "max": int(s.get("max", 1)), "weight": int(s.get("weight", 1)), "data": int(s.get("data", 5))}
        vt = term(d.get("visualName"))
        boxes[bid] = {"id": bid, "type": int(d.get("boxType", 0)), "name": (loc.get(vt) or bid).strip() if vt else bid,
                      "cosmetics": int(d.get("cosmetics", 0)), "basic": [slot(s) for s in d.get("basicSlots") or []],
                      "premium": [slot(s) for s in d.get("premiumSlots") or []], "ads": [slot(s) for s in d.get("adSlots") or []]}
    droppers = {}
    dcoll = so(asset("MonoBehaviour/DropTypeHandlers.asset"))
    for r in dcoll.get("assets") or []:
        p = ref_path(r)
        if not p:
            continue
        d = so(p)
        e = {"cls": script_name(d), "allowed": uints(d.get("allowed"))}
        if "mustBeEquipped" in d:
            e["mustBeEquipped"] = int(d["mustBeEquipped"])
        if d.get("dropperData"):
            e["sub"] = [{"dropper": so(ref_path(x.get("dropper"))).get("m_Name"), "cards": int(x.get("cards", 1)),
                         "weight": int(x.get("weight", 1))} for x in d["dropperData"] if ref_path(x.get("dropper"))]
        droppers[d.get("m_Name")] = e
    root = so(asset("MonoBehaviour/LootboxService.asset"))
    s = root.get("settings") or {}
    la = root.get("lootboxArt") or s.get("lootboxArt") or {}
    art = {}
    keys = uints(la.get("keyData"))
    for k, v in zip(keys, la.get("valueData") or []):
        art[k] = {"sprite": sprite(v.get("sprite")), "small": sprite(v.get("smallSprite"))}
    settings = {"refundCard": int(s.get("refundCurrencyCard", 2000000300)), "groupDuplicates": int(s.get("groupDuplicates", 1)),
                "typeTable": [[int(t["type"]), int(t["weight"])] for t in ((s.get("cosmeticsTypeDropTable") or {}).get("table") or [])]}
    return {"boxes": boxes, "droppers": droppers, "settings": settings, "art": art}


def shop():
    lb = so(asset("MonoBehaviour/LootboxShopRemoteSettings.asset"))
    lbs = lb.get("data") or lb

    def pay(o):
        return {"pay": int(o.get("pay", 0)), "amount": int(o.get("amount", 0)), "data": str(o.get("data", "")),
                "get": int(o.get("get", 0)), "lootbox": str(((o.get("lootboxID") or {}).get("id")) if isinstance(o.get("lootboxID"), dict) else o.get("lootboxID") or ""),
                "sticker": term(o.get("sticker"))}
    dd = so(asset("MonoBehaviour/DailyDealsShopData.asset"))
    gift = so(asset("MonoBehaviour/HardCurrencyShopGiftSettings.asset"))
    cur = so(asset("MonoBehaviour/ShopCurrencies Remote.asset"))
    curs = cur.get("data") or cur
    order = so(asset("MonoBehaviour/Shop Settings Remote.asset"))
    orders = order.get("data") or order
    packs = {}
    for key in ("soft", "hard"):
        grp = curs.get(key)
        if isinstance(grp, dict):
            packs[key] = [pay(o) for o in grp.get("options") or []]
    gcs = so(asset("MonoBehaviour/GameCurrencyService.asset")).get("settings") or {}
    return {
        "order": [str(x) for x in orders.get("order") or []],
        "lootboxOptions": [pay(o) for o in lbs.get("options") or []],
        "rvCooldownOption": pay(lbs.get("rvCooldownOption") or {}),
        "dailyDeals": {"perRank": [[int(x["rank"]), int(x["count"])] for x in dd.get("dailyDealsPerRank") or []],
                       "refreshesPerDay": int(dd.get("refreshesPerDay", 3)), "refreshCost": int(dd.get("refreshHardCurrencyCost", 5)),
                       "costs": [[int(c.get("soft", 0)), int(c.get("hard", 0))] for c in ((dd.get("costs") or {}).get("data") or [])],
                       "allowedTypes": uints(dd.get("allowedTypes")),
                       "items": [[[int(p.get("paymentOption", 4)), int(p.get("type", 1))] for p in it.get("paymentData") or []]
                                 for it in dd.get("itemDefinitions") or []]},
        "gift": {"amount": int(gift.get("giftRubyAmount", 20)), "perDay": int(gift.get("giftsPerDay", 1)), "unlockRank": int(gift.get("giftUnlockRank", 4))},
        "packs": packs,
        "start": {"soft": int(gcs.get("softStartCurrency", 0)), "hard": int(gcs.get("hardStartCurrency", 0))},
    }


def daily_lootbox():
    core = load_file(asset("GameObject/Core.prefab"))
    for d in core.values():
        if d["type"] == "MonoBehaviour" and script_name(d["data"]) == "DailyLootboxManager":
            return [{"xp": int(x.get("xpNeeded", 0)), "lootbox": ((x.get("lootbox") or {}).get("id"))}
                    for x in d["data"].get("lootboxXpDefinitions") or []]
    return []


def bonus():
    b = so(asset("MonoBehaviour/Bonus Ride Settings.asset"))
    return {"onClaim": int(b.get("bonusCurrencyOnClaim", 400)), "rvMultiplier": float(b.get("bonusCurrencyRVMultiplier", 2)),
            "refreshTime": ticks(b.get("bonusCurrencyRefreshTime"))}


def main():
    loc = localization()
    meta = {"loc": loc}
    meta.update(cards(loc))
    meta["challenges"] = challenges(loc)
    meta["rank"] = rank()
    meta["rankTrack"] = track("MonoBehaviour/RankTrack.asset")
    meta["rvTrack"] = track("MonoBehaviour/RVRewardTrack.asset")
    meta["worlds"] = worlds()
    meta["lootboxes"] = lootboxes(loc)
    meta["shop"] = shop()
    meta["dailyLootbox"] = daily_lootbox()
    meta["bonus"] = bonus()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"), ensure_ascii=False)
    print("meta:", len(loc), "terms,", len(meta["cards"]), "cards,", sum(len(w) for w in meta["challenges"]["worlds"]), "challenges,",
          f"{os.path.getsize(OUT) / 1e3:.0f} kB")


if __name__ == "__main__":
    sys.exit(main())
