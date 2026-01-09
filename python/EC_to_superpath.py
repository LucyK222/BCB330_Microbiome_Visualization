import csv

def load_ec_to_map(filepath):
    """Load EC to pathway (map) mapping from EC_pathway.txt"""
    ec_to_map = {}
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            left, right = line.split("\t")
            map_id = left.replace("path:", "")
            ec = right.replace("ec:", "")
            ec_to_map.setdefault(ec, []).append(map_id)
    return ec_to_map

def load_map_to_superpathway(filepath):
    """Load pathway (map) to superpathway mapping from pathway_to_superpathway.txt"""
    map_to_super = {}
    with open(filepath, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            superpath = row["Superpathway"]
            map_id = row["Pathway ID"]
            map_to_super[map_id] = superpath
    return map_to_super

def get_superpathway_for_ec(ec, ec_to_map, map_to_super):
    """Given an EC number, return a list of superpathways it belongs to"""
    maps = ec_to_map.get(ec, [])
    superpaths = set()  # use set to avoid duplicates
    for m in maps:
        if m in map_to_super:
            superpaths.add(map_to_super[m])
    return list(superpaths)

# --- Usage ---
ec_to_map = load_ec_to_map("../databases/EC_pathway.txt")
map_to_super = load_map_to_superpathway("../databases/pathway_to_superpathway.csv")

ec_number = "1.1.1.1"
superpaths = get_superpathway_for_ec(ec_number, ec_to_map, map_to_super)
print(f"EC {ec_number} belongs to superpathways: {superpaths}")
