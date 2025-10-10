import os, json

# Folder containing all your filter subfolders
root = "Filters"

data = {}

for subdir, _, files in os.walk(root):
    for fname in files:
        if fname.endswith(".txt"):
            path = os.path.join(subdir, fname)
            relpath = os.path.relpath(path, root)  # e.g. Folder1/test.txt
            with open(path, "r", encoding="utf-8") as f:
                data[relpath.replace("\\", "/")] = f.read()

# Write to filters.js
with open("filters.js", "w", encoding="utf-8") as out:
    out.write("window.filters = ")
    json.dump(data, out, ensure_ascii=False, indent=2)
    out.write(";")
