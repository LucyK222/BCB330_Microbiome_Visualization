import pandas as pd
import json

# ── 1. Load the complete taxonomy tree ────────────────────────────────────────
with open("../data/taxa_complete.json") as f:
    taxa_complete = json.load(f)

# ── 2. Build a flat lookup: node_name → ancestor path ─────────────────────────
# Walk the full tree and record, for every node, the list of ancestor names
# from root down to (and including) that node.
# Structure: { "Eubacterium sp. 14-2": ["Firmicutes", "Clostridia", ...,"Eubacterium sp. 14-2"] }

lookup = {}   # name → [phylum, class, order, family, genus, species] path

def walk(node, path):
    """Recursively walk the tree, recording each node's full ancestor path."""
    current_path = path + [node["name"]]

    if "children" not in node or len(node["children"]) == 0:
        # Leaf node (species level) — record full path
        lookup[node["name"]] = current_path
    else:
        # Internal node — record it too so mixed-rank names can be found
        lookup[node["name"]] = current_path
        for child in node["children"]:
            walk(child, current_path)

# Start from root's children (phylum level), skipping the "root" node itself
for phylum_node in taxa_complete.get("children", []):
    walk(phylum_node, [])

print(f"Built lookup with {len(lookup)} unique taxon names")

# ── 3. Load RPKM table ────────────────────────────────────────────────────────
rpkm_df = pd.read_csv("../databases/RPKM_table.tsv", sep="\t", index_col=0)

# The fixed (non-taxon) columns MetaPro always includes
FIXED_COLS = {"Length", "Reads", "ECF", "RPKM", "Bacteria"}

# Everything else is a taxon column
taxon_cols = [c for c in rpkm_df.columns if c not in FIXED_COLS]
print(f"Found {len(taxon_cols)} taxon columns: {taxon_cols}")

# Sum RPKM values per taxon column
taxon_rpkm = {}
for col in taxon_cols:
    numeric_col = pd.to_numeric(rpkm_df[col], errors='coerce').fillna(0)
    total = numeric_col.sum()
    if total > 0:
        taxon_rpkm[col] = float(total)

print(f"\nTaxa with non-zero RPKM sum:")
for name, val in sorted(taxon_rpkm.items(), key=lambda x: -x[1]):
    print(f"  {name}: {val:.2f}")

# ── 4. Map each taxon name to its hierarchy path ──────────────────────────────
total_rpkm = sum(taxon_rpkm.values())

# For each taxon column, find its path in the lookup
# If exact match fails, try case-insensitive or partial match
def find_path(name):
    # Exact match
    if name in lookup:
        return lookup[name]
    # Case-insensitive match
    name_lower = name.lower()
    for key, path in lookup.items():
        if key.lower() == name_lower:
            return path
    # Partial match — name is a substring of a lookup key or vice versa
    for key, path in lookup.items():
        if name_lower in key.lower() or key.lower() in name_lower:
            return path
    return None

unmatched = []
matched = {}   # taxon_name → (path, rpkm_sum)

for taxon_name, rpkm_sum in taxon_rpkm.items():
    path = find_path(taxon_name)
    if path:
        matched[taxon_name] = (path, rpkm_sum)
        print(f"  ✓ '{taxon_name}' → {' / '.join(path)}")
    else:
        unmatched.append(taxon_name)
        print(f"  ✗ '{taxon_name}' — NOT FOUND in taxa_complete.json")

if unmatched:
    print(f"\nWarning: {len(unmatched)} taxa could not be mapped: {unmatched}")
    print("These will be placed under 'Unmatched Taxa' at the top level.")

# ── 5. Build the RPKM hierarchy ───────────────────────────────────────────────
#
# The path from the lookup has variable depth depending on where in the tree
# the taxon was found. We reconstruct a nested dict, then convert to JSON.
#
# path examples:
#   ["Firmicutes"]                                    → phylum only
#   ["Firmicutes", "Clostridia"]                      → phylum + class
#   ["Firmicutes", ..., "Eubacterium", "Eub. sp 14-2"] → full depth

def insert_path(tree_dict, path, rpkm_value, percentage):
    """
    Insert a taxon into a nested dict structure.
    tree_dict is mutated in place.
    """
    node = tree_dict
    for i, level_name in enumerate(path):
        if level_name not in node:
            node[level_name] = {"_rpkm": 0.0, "_percentage": 0.0, "_children": {}}
        node[level_name]["_rpkm"]       += rpkm_value
        node[level_name]["_percentage"] += percentage
        node = node[level_name]["_children"]

tree_dict = {}

for taxon_name, (path, rpkm_sum) in matched.items():
    pct = rpkm_sum / total_rpkm if total_rpkm > 0 else 0
    insert_path(tree_dict, path, rpkm_sum, pct)

# Place unmatched taxa under a catch-all node
for taxon_name in unmatched:
    rpkm_sum = taxon_rpkm.get(taxon_name, 0)
    pct = rpkm_sum / total_rpkm if total_rpkm > 0 else 0
    insert_path(tree_dict, ["Unmatched Taxa", taxon_name], rpkm_sum, pct)

def dict_to_json(name, node_dict):
    """Convert the nested dict structure into the same JSON format as taxa_complete.json"""
    children = []
    for child_name, child_data in node_dict["_children"].items():
        children.append(dict_to_json(child_name, child_data))

    result = {
        "name":       name,
        "percentage": round(node_dict["_percentage"], 6),
    }

    if children:
        result["children"] = children
    else:
        # Leaf node: use rpkm as value (mirrors how taxa_complete.json uses read count)
        result["value"] = round(node_dict["_rpkm"], 4)

    return result

# Build the root node
root_children = []
for phylum_name, phylum_data in tree_dict.items():
    root_children.append(dict_to_json(phylum_name, phylum_data))

rpkm_hierarchy = {
    "name":     "root",
    "children": root_children
}

# ── 6. Save ───────────────────────────────────────────────────────────────────
output_path = "../data/taxa_rpkm.json"
with open(output_path, "w") as f:
    json.dump(rpkm_hierarchy, f, indent=2)

print(f"\nSaved RPKM hierarchy to {output_path}")
print(f"  Top-level nodes: {[c['name'] for c in rpkm_hierarchy['children']]}")
print(f"  Total RPKM summed: {total_rpkm:.2f}")