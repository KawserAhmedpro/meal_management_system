import zipfile
import xml.etree.ElementTree as ET
import json

xlsx_path = r"d:\Meal Management System\SULTAN MEAL.xlsx"

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss_tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in ss_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
            shared_strings.append("".join(si.itertext()))

    def get_sheet_rows(sheet_name):
        rels_tree = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_tree}
        wb_tree = ET.fromstring(z.read("xl/workbook.xml"))
        for s in wb_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
            if s.attrib.get("name") == sheet_name:
                r_id = s.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                target = "xl/" + rel_map[r_id]
                s_tree = ET.fromstring(z.read(target))
                rows_data = []
                for r in s_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                    row_dict = {}
                    for c in r.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                        ref = c.attrib.get("r")
                        col = "".join(filter(str.isalpha, ref))
                        t = c.attrib.get("t")
                        v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                        f = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}f")
                        val = v.text if v is not None else ""
                        if t == "s" and val.isdigit():
                            val = shared_strings[int(val)]
                        row_dict[col] = val
                    rows_data.append((int(r.attrib.get("r")), row_dict))
                return rows_data
        return []

    # Parse Transactions sheet
    tx_rows = get_sheet_rows("Transactions")
    members = []
    current_floor = "1st Floor"
    current_room = ""

    for r_num, cols in tx_rows:
        colA = cols.get("A", "").strip()
        colB = cols.get("B", "").strip()
        
        # Detect floor headers
        upperA = colA.upper()
        upperB = colB.upper()
        if "2ND FLOOR" in upperA or "2ND FLOOR" in upperB or "FLOOR-2" in upperA:
            current_floor = "2nd Floor"
            continue
        elif "3RD FLOOR" in upperA or "3RD FLOOR" in upperB:
            current_floor = "3rd Floor"
            continue
        elif "4TH FLOOR" in upperA or "4TH FLOOR" in upperB:
            current_floor = "4th Floor"
            continue
        elif "5TH FLOOR" in upperA or "5TH FLOOR" in upperB:
            current_floor = "5th Floor"
            continue
        elif "1ST FLOOR" in upperA or "1ST FLOOR" in upperB:
            current_floor = "1st Floor"
            continue

        if colA.upper().startswith("ROOM"):
            current_room = colA.strip()

        if colB and colB.upper() not in ["NAME", "TOTAL", "ROOM NO"]:
            # Check deposits
            deps = []
            for col_l in ["C", "D", "E", "F", "G"]:
                val = cols.get(col_l, "").strip()
                if val and val != "0":
                    try:
                        deps.append(float(val))
                    except:
                        pass
            
            # Floor determination if room starts with ROOM-1xx, ROOM-2xx, etc.
            floor_calc = current_floor
            room_clean = current_room.upper()
            if "ROOM-1" in room_clean or "ROOM-0" in room_clean:
                floor_calc = "1st Floor"
            elif "ROOM-2" in room_clean:
                floor_calc = "2nd Floor"
            elif "ROOM-3" in room_clean:
                floor_calc = "3rd Floor"
            elif "ROOM-4" in room_clean:
                floor_calc = "4th Floor"
            elif "ROOM-5" in room_clean:
                floor_calc = "5th Floor"

            member_id = f"MEM-{len(members)+1:03d}"
            members.append({
                "id": member_id,
                "name": colB,
                "room": current_room,
                "floor": floor_calc,
                "status": "Active",
                "row": r_num,
                "sample_deposits": deps
            })

    print(f"Extracted {len(members)} members")
    with open("d:/Meal Management System/extracted_members.json", "w", encoding="utf-8") as out:
        json.dump(members, out, indent=2, ensure_ascii=False)
