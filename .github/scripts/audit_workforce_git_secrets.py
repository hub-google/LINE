#!/usr/bin/env python3
"""Scan all reachable Git refs, including historical blobs, for Work secrets.

Does not print or persist secret values or matching source lines.
All exact matches use encrypted GitHub Actions Secrets injected only at runtime.
"""
from __future__ import annotations
import os
import re
import subprocess
import sys

ENV_KEYS=("WORK_LINE_MESSAGING_ACCESS_TOKEN","WORK_LINE_MESSAGING_CHANNEL_SECRET")
# Generic high-confidence credential *assignments*, not ordinary 32-char IDs.
SUSPECT=re.compile(
    rb"(?:LINE_[A-Z_]*(?:SECRET|TOKEN)|channel_secret|channel_access_token)"
    rb"\s*(?:=|:)\s*['\"]?[A-Za-z0-9+/_=-]{38,}",
    re.IGNORECASE,
)


def objects():
    data=subprocess.check_output(["git","rev-list","--objects","--all"])
    seen=set()
    for line in data.splitlines():
        oid,_,path=line.partition(b" ")
        if oid in seen:
            continue
        seen.add(oid)
        yield oid,path


def scan():
    keys=[(key,os.environ[key].encode()) for key in ENV_KEYS if os.environ.get(key)]
    missing=[k for k in ENV_KEYS if not os.environ.get(k)]
    maxlen=max((len(v) for _,v in keys),default=180)
    maxlen=max(maxlen,180)
    inspected=0
    blobs=0
    suspect_paths=[]
    exact_paths=[]
    reader=subprocess.Popen(["git","cat-file","--batch"],
      stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    try:
        for oid,path in objects():
            reader.stdin.write(oid+b"\n")
            reader.stdin.flush()
            header=reader.stdout.readline().split()
            if len(header)!=3 or header[0]!=oid:
                raise RuntimeError("Git object stream is incomplete")
            obj_type=header[1]
            size=int(header[2])
            inspected+=1
            remaining=size
            tail=b""
            suspect=False
            exact=set()
            while remaining:
                chunk=reader.stdout.read(min(65536,remaining))
                if not chunk:
                    raise RuntimeError("Git object stream was truncated")
                remaining-=len(chunk)
                if obj_type!=b"blob":
                    continue
                combined=tail+chunk
                for key,value in keys:
                    if value in combined:
                        exact.add(key)
                # Only run assignment heuristics on text-like blobs <= 4 MB.
                if size<=4*1024*1024 and not suspect and SUSPECT.search(combined):
                    suspect=True
                tail=combined[-maxlen:]
            if reader.stdout.read(1)!=b"\n":
                raise RuntimeError("Git object record boundary missing")
            if obj_type==b"blob":
                blobs+=1
                if suspect:
                    suspect_paths.append(path.decode("utf-8","replace") or "[unnamed historical blob]")
                if exact:
                    exact_paths.append((path.decode("utf-8","replace") or "[unnamed historical blob]",
                                        ",".join(sorted(exact))))
        print(f"Scanned {blobs} distinct historical Git blobs across {inspected} reachable objects.")
        print(f"High-confidence literal credential assignments found: {len(suspect_paths)}.")
        if missing:
            print("::warning title=Exact history check incomplete::Work OA Secrets are not yet configured; exact-value matching skipped for: "+", ".join(missing))
        else:
            print("Exact comparison against configured WF OA secrets completed.")
        if exact_paths:
            for path,names in exact_paths[:30]:
                print(f"::error title=Historical credential exposure::{names} found in {path} (content withheld).")
            return 1
        if suspect_paths:
            for path in list(dict.fromkeys(suspect_paths))[:20]:
                print(f"::warning title=Possible historical credential assignment::Inspect {path} (matching content withheld).")
            # Heuristics may match false positives. Report, do not claim clean.
        return 0
    finally:
        reader.stdin.close()
        reader.stdout.close()
        reader.wait(timeout=5)


if __name__=="__main__":
    try:
        raise SystemExit(scan())
    except Exception as error:
        print("::error title=Git history audit failed::"+str(error),file=sys.stderr)
        raise SystemExit(1)
