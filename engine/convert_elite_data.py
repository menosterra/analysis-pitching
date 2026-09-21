# -*- coding: utf-8 -*-
import json
import re
import os

src_path = r"C:\Project\Science_pitching\pitching_data_elite_high.js"
out_path1 = r"C:\Project\App_pitching\data\elite_three_quarter.json"
out_path2 = r"C:\Project\App_pitching\static\elite_three_quarter.json"

with open(src_path, 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'const\s+\w+\s*=\s*(\{[\s\S]*?\n\};)', text)
if not m:
    m = re.search(r'=\s*(\{[\s\S]*\});?', text)

if m:
    raw = m.group(1).strip()
    if raw.endswith(';'):
        raw = raw[:-1].strip()
    data = json.loads(raw)
    
    os.makedirs(os.path.dirname(out_path1), exist_ok=True)
    os.makedirs(os.path.dirname(out_path2), exist_ok=True)
    
    with open(out_path1, 'w', encoding='utf-8') as f1:
        json.dump(data, f1, indent=2)
    with open(out_path2, 'w', encoding='utf-8') as f2:
        json.dump(data, f2, indent=2)
    print(f"Saved elite dataset: {data.get('session_pitch')}, {len(data.get('frames', []))} frames")
else:
    print("Could not parse JS data")
