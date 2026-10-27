"""훑기용 ezdxf 대조(개발 도구, 선택): 표준 입력으로 받은 DXF마다 요약과 audit 결과를 JSON 파일로 쓴다.

사용법(훑기 워커가 띄운다): python -I ezdxf_batch.py
  표준 입력 한 줄에 {"in": DXF 경로, "out": 결과 JSON 경로} 하나 → 다 쓰면 표준 출력에 "ok" 한 줄.
요약은 scripts/oracle/ezdxf_dump.py와 같은 형식에 치수 측정값과 블록 참조의 속성 값(태그=값)을 더한다.
"""

import importlib.util
import json
import logging
import os
import sys
import traceback

sys.dont_write_bytecode = True  # 저장소에 __pycache__를 남기지 않는다

import ezdxf  # noqa: E402
from ezdxf import recover  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ezdxf_dump", os.path.join(HERE, "..", "oracle", "ezdxf_dump.py"))
dump = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dump)


class Collect(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.items = []

    def emit(self, record):
        try:
            self.items.append(record.getMessage()[:300])
        except Exception:
            pass


def summarize(e):
    try:
        d = dump.summarize(e)
    except Exception as ex:
        return {"type": e.dxftype(), "handle": (e.dxf.get("handle") or "").upper(), "summarizeError": repr(ex)[:200]}
    t = e.dxftype()
    if t in ("DIMENSION", "ARC_DIMENSION", "LARGE_RADIAL_DIMENSION"):
        m = e.dxf.get("actual_measurement", None)
        d["measurement"] = dump.r(m) if m is not None else None
    if t == "INSERT":
        d["attvals"] = [f"{a.dxf.get('tag', '')}={a.dxf.get('text', '')}" for a in e.attribs]
    return d


def tally(items):
    counts, first = {}, []
    for e in items:
        k = int(e.code)
        counts[k] = counts.get(k, 0) + 1
        if len(first) < 8:
            first.append(f"{k}: {e.message}"[:240])
    return counts, first


def one(path):
    handler = Collect()
    logger = logging.getLogger("ezdxf")
    logger.addHandler(handler)
    res = {"ok": False}
    try:
        try:
            doc = ezdxf.readfile(path)
        except Exception as exc:
            res["loadError"] = f"{type(exc).__name__}: {exc}"[:400]
            doc, _ = recover.readfile(path)
            res["recovered"] = True
        out = {
            "version": doc.dxfversion,
            "layers": sorted((dump.layer_of(l) for l in doc.layers), key=lambda x: x["name"].upper()),
            "blocks": {},
        }
        for blk in doc.blocks:
            out["blocks"][blk.name.upper()] = [summarize(e) for e in blk]
        res["summary"] = out
        auditor = doc.audit()
        res["auditErrors"], res["auditFirst"] = tally(auditor.errors)
        res["auditFixes"], res["auditFixFirst"] = tally(auditor.fixes)
        res["ok"] = True
    except Exception as exc:
        res["error"] = f"{type(exc).__name__}: {exc}"[:400]
        res["trace"] = traceback.format_exc()[-800:]
    finally:
        logger.removeHandler(handler)
    res["log"] = handler.items[:20]
    return res


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        r = one(job["in"])
        with open(job["out"], "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False)
        sys.stdout.write("ok\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
