#!/usr/bin/env python3
"""Validate the devotional workbook and produce reviewable JSON and SQL seed files."""
from __future__ import annotations
import argparse, json, re, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
FIELDS = ["day_number","devotional_date","weekday","month_theme","tree_stage","week_number","week_theme","devotional_title","selected_scripture_reference","roots_reading","branches_reading","fruit_reading","chapter_count","scripture_text","context_summary","key_points","reflection_questions","life_application","response_prayer"]

def column_index(value: str) -> int:
    result = 0
    for char in value: result = result * 26 + ord(char) - 64
    return result

def workbook_rows(path: Path) -> list[dict[str,str]]:
    with zipfile.ZipFile(path) as archive:
        strings=[]
        if "xl/sharedStrings.xml" in archive.namelist():
            root=ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings=["".join(node.text or "" for node in item.iter(NS+"t")) for item in root.findall(NS+"si")]
        root=ET.fromstring(archive.read("xl/worksheets/sheet1.xml")); rows=[]
        for row in root.findall(".//"+NS+"row"):
            values={}
            for cell in row.findall(NS+"c"):
                column=re.match(r"[A-Z]+",cell.attrib["r"]).group(); kind=cell.attrib.get("t"); raw=cell.find(NS+"v")
                values[column]="".join(node.text or "" for node in cell.iter(NS+"t")) if kind=="inlineStr" else (strings[int(raw.text)] if raw is not None and kind=="s" else (raw.text if raw is not None else ""))
            rows.append(values)
    header=rows[0]; columns=sorted(header,key=column_index)
    return [{header[column]:row.get(column,"").strip() for column in columns} for row in rows[1:]]

def reference_in_reading(reference: str, reading: str) -> bool:
    match=re.match(r"(.+?)\s*(\d+):",reference)
    if not match:return False
    book,chapter=match.group(1),int(match.group(2))
    for part in re.split(r"[；;]",reading):
        found=re.match(r"(.+?)\s+(\d+)(?:[–-](\d+))?$",part.strip())
        if found and found.group(1)==book and int(found.group(2))<=chapter<=int(found.group(3) or found.group(2)):return True
    return False

def sql(value):
    if value is None:return "null"
    if isinstance(value,bool):return "true" if value else "false"
    if isinstance(value,int):return str(value)
    return "'"+str(value).replace("'","''")+"'"

def main() -> None:
    parser=argparse.ArgumentParser();parser.add_argument("workbook",type=Path);parser.add_argument("--month",required=True,help="YYYY-MM");parser.add_argument("--out",type=Path,default=Path("data"));args=parser.parse_args()
    rows=[row for row in workbook_rows(args.workbook) if row.get("devotional_date","").startswith(args.month+"-")]
    errors=[]
    if not rows:errors.append("指定月份沒有資料")
    required=set(FIELDS)
    for row in rows:
        missing=[field for field in required if not row.get(field,"") and field not in {"branches_reading","fruit_reading"}]
        if missing:errors.append(f"{row.get('devotional_date','未知日期')} 缺少：{', '.join(missing)}")
        reading="；".join(row.get(field,"") for field in ("roots_reading","branches_reading","fruit_reading"))
        if not reference_in_reading(row.get("selected_scripture_reference",""),reading):errors.append(f"{row.get('devotional_date')} 精選經文不在當日讀經範圍")
        if "[系統將由" in row.get("scripture_text",""):errors.append(f"{row.get('devotional_date')} 仍有經文佔位文字")
    for field in ("devotional_title","selected_scripture_reference","context_summary"):
        values=[row.get(field,"") for row in rows]
        if len(values)!=len(set(values)):errors.append(f"{field} 有重複內容")
    if errors:raise SystemExit("匯入檢查失敗：\n- "+"\n- ".join(errors))
    items=[]
    for row in rows:
        item={field:row.get(field,"") for field in FIELDS}
        for field in ("day_number","week_number","chapter_count"):item[field]=int(item[field])
        item["scripture_is_excerpt"]="…" in item["scripture_text"] or "..." in item["scripture_text"]
        item["review_status"]="initial_review";items.append(item)
    args.out.mkdir(parents=True,exist_ok=True);json_path=args.out/f"devotionals-{args.month}.json";json_path.write_text(json.dumps({"church_id":"M+","source_file":args.workbook.name,"items":items},ensure_ascii=False,indent=2)+"\n")
    fields=["church_id"]+FIELDS+["scripture_is_excerpt","scripture_version","scripture_source","scripture_license_note","review_status"]
    lines=[f"-- Generated from {args.workbook.name}","-- Insert-only seed: existing reviewed dates are never overwritten.","begin;"]
    for item in items:
        row={"church_id":"M+",**item,"scripture_version":None,"scripture_source":None,"scripture_license_note":None}
        lines.append(f"insert into public.daily_devotionals ({', '.join(fields)}) values ({', '.join(sql(row[field]) for field in fields)}) on conflict (church_id, devotional_date) do nothing;")
    lines.append("commit;");sql_path=args.out/f"devotionals-{args.month}.sql";sql_path.write_text("\n".join(lines)+"\n")
    print(f"通過：{len(items)} 篇；輸出 {json_path}、{sql_path}")
if __name__=="__main__":main()
