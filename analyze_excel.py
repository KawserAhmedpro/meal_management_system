import zipfile
import xml.etree.ElementTree as ET
import os

xlsx_path = r"d:\Meal Management System\SULTAN MEAL.xlsx"

with zipfile.ZipFile(xlsx_path, 'r') as z:
    # List sheets
    workbook_xml = z.read("xl/workbook.xml")
    wb_tree = ET.fromstring(workbook_xml)
    sheets = []
    for s in wb_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
        name = s.attrib.get("name")
        sheet_id = s.attrib.get("sheetId")
        r_id = s.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        sheets.append((name, sheet_id, r_id))
    print("Sheets in workbook:", sheets)

    # Read shared strings if any
    shared_strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss_xml = z.read("xl/sharedStrings.xml")
        ss_tree = ET.fromstring(ss_xml)
        for si in ss_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
            t = "".join(si.itertext())
            shared_strings.append(t)
    print(f"Total shared strings: {len(shared_strings)}")

    # Inspect each sheet
    # Let's inspect workbook relations
    rels_xml = z.read("xl/_rels/workbook.xml.rels")
    rels_tree = ET.fromstring(rels_xml)
    rel_map = {}
    for rel in rels_tree:
        rel_map[rel.attrib["Id"]] = rel.attrib["Target"]

    for name, s_id, r_id in sheets:
        target = rel_map.get(r_id)
        if not target.startswith("worksheets/"):
            target = "xl/" + target
        else:
            target = "xl/" + target
        print(f"\n--- Sheet: {name} ({target}) ---")
        sheet_xml = z.read(target)
        s_tree = ET.fromstring(sheet_xml)
        rows = s_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")
        print(f"Row count: {len(rows)}")
        # Print first 15 rows
        for r in rows[:15]:
            row_num = r.attrib.get("r")
            cells = []
            for c in r.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                ref = c.attrib.get("r")
                t = c.attrib.get("t")
                v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                f = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}f")
                val = v.text if v is not None else ""
                formula = f.text if f is not None else ""
                if t == "s" and val.isdigit():
                    val = shared_strings[int(val)]
                cells.append(f"{ref}={repr(val)}" + (f" [f:{formula}]" if formula else ""))
            if cells:
                print(f"Row {row_num}: {', '.join(cells[:8])}{' ...' if len(cells)>8 else ''}")
