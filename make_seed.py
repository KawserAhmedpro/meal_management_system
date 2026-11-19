import json

with open("d:/Meal Management System/extracted_members.json", encoding="utf-8") as f:
    members = json.load(f)

clean_members = []
for m in members:
    clean_members.append({
        "id": m["id"],
        "name": m["name"],
        "room": m["room"],
        "floor": m["floor"],
        "joiningDate": "2026-01-01",
        "status": m["status"],
        "phone": "",
        "notes": ""
    })

content = f"""import {{ Member }} from '../types';

export const SEED_MEMBERS: Omit<Member, 'createdAt' | 'updatedAt'>[] = {json.dumps(clean_members, indent=2, ensure_ascii=False)};
"""

with open("d:/Meal Management System/src/db/seedMembers.ts", "w", encoding="utf-8") as f_out:
    f_out.write(content)

print(f"Generated seedMembers.ts with {len(clean_members)} members")
