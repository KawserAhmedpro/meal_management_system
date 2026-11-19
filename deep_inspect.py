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
                        formula = f.text if f is not None else ""
                        row_dict[col] = (val, formula)
                    rows_data.append((int(r.attrib.get("r")), row_dict))
                return rows_data
        return []

    print("=== TRANSACTIONS SHEET ANALYSIS ===")
    tx_rows = get_sheet_rows("Transactions")
    rooms_and_members = []
    current_floor = "1st Floor"
    current_room = ""
    for r_num, cols in tx_rows:
        colA = cols.get("A", ("", ""))[0].strip()
        colB = cols.get("B", ("", ""))[0].strip()
        
        # Check if floor header
        if "FLOOR" in colA.upper() or "FLOOR" in colB.upper():
            current_floor = colA if colA else colB
            continue
        
        if colA.upper().startswith("ROOM"):
            current_room = colA
        
        if colB and colB.upper() not in ["NAME", "TOTAL"]:
            deps = [cols.get(c, ("", ""))[0] for c in ["C", "D", "E", "F", "G"]]
            tot_dep = cols.get("H", ("", ""))[0]
            tot_dep_f = cols.get("H", ("", ""))[1]
            meal_exp = cols.get("I", ("", ""))[0]
            meal_exp_f = cols.get("I", ("", ""))[1]
            mgr_fee = cols.get("J", ("", ""))[0]
            mgr_fee_f = cols.get("J", ("", ""))[1]
            due = cols.get("K", ("", ""))[0]
            due_f = cols.get("K", ("", ""))[1]
            rooms_and_members.append({
                "floor": current_floor,
                "room": current_room,
                "name": colB,
                "row": r_num,
                "deposits": deps,
                "formulas": {
                    "total_dep": tot_dep_f,
                    "meal_exp": meal_exp_f,
                    "mgr_fee": mgr_fee_f,
                    "due": due_f
                }
            })

    print(f"Total members found in Transactions: {len(rooms_and_members)}")
    print("Sample member record:", json.dumps(rooms_and_members[0], indent=2))

    floors = sorted(list(set(m["floor"] for m in rooms_and_members)))
    rooms = sorted(list(set(m["room"] for m in rooms_and_members)))
    print(f"Floors ({len(floors)}):", floors)
    print(f"Rooms ({len(rooms)}):", rooms)

    print("\n=== COSTS SHEET ANALYSIS ===")
    costs_rows = get_sheet_rows("Costs")
    for r_num, cols in costs_rows:
        date = cols.get("B", ("", ""))[0]
        item = cols.get("C", ("", ""))[0]
        cost = cols.get("D", ("", ""))[0]
        extra = {k: v[0] + (f" [f:{v[1]}]" if v[1] else "") for k, v in cols.items() if k not in ["B", "C", "D"] and (v[0] or v[1])}
        if date or item or cost or extra:
            print(f"Row {r_num}: Date={repr(date)}, Item={repr(item)}, Cost={repr(cost)}, Extra={extra}")

    print("\n=== MEALS SHEET DAYS & HEADERS ===")
    meals_rows = get_sheet_rows("Meals")
    for r_num, cols in meals_rows[:6]:
        if r_num == 4:
            days = {col: val[0] for col, val in cols.items()}
            print(f"Row 4 (Headers): {days}")

    print("\n=== PRINT SHEET STRUCTURE ===")
    print_rows = get_sheet_rows("Print")
    for r_num, cols in print_rows[:15]:
        line = {k: v[0] for k, v in cols.items() if v[0]}
        if line:
            print(f"Print Row {r_num}: {line}")
