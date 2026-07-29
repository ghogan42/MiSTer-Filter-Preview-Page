import os, json

# Folder containing all your preset subfolders
root = "Presets"

data = {}

for subdir, _, files in os.walk(root):
    for fname in files:
        if fname.endswith(".ini"):
            path = os.path.join(subdir, fname)
            relpath = os.path.relpath(path, root)  # e.g. Folder1/test.ini
            with open(path, "r", encoding="utf-8") as f:
                data[relpath.replace("\\", "/")] = f.read()

# Write to presets.js
with open("../presets.js", "w", encoding="utf-8") as out:
    out.write("window.presets = ")
    json.dump(data, out, ensure_ascii=False, indent=2)
    out.write(";")
