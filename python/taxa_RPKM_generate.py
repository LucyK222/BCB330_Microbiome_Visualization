import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
taxa_complete_path = ROOT / "data" / "taxa_complete.json"
rpkm_table_path = ROOT / "databases" / "RPKM_table.tsv"
output_path = ROOT / "data" / "taxa_rpkm.json"

# ── 1. Load the complete taxonomy tree ────────────────────────────────────────
with open(taxa_complete_path) as f:
    taxa_complete = json.load(f)

# ── 2. Build a flat lookup: node_name → ancestor path ─────────────────────────
lookup = {}   # name → [phylum, class, order, family, genus, species] path

def walk(node, path):
    """Recursively walk the tree, recording each node's full ancestor path."""
    current_path = path + [node["name"]]
    lookup[node["name"]] = current_path
    for child in node.get("children", []):
        walk(child, current_path)

for phylum_node in taxa_complete.get("children", []):
    walk(phylum_node, [])

print(f"Built lookup with {len(lookup)} unique taxon names")

# ── 3. Load RPKM table ────────────────────────────────────────────────────────
rpkm_df = pd.read_csv(rpkm_table_path, sep="\t", index_col=0)

FIXED_COLS = {"GeneID", "EC#", "Length", "Reads", "ECF", "RPKM", "Bacteria"}
taxon_cols = [c for c in rpkm_df.columns if c not in FIXED_COLS]
print(f"Found {len(taxon_cols)} taxon columns: {taxon_cols}")

# Sum RPKM values per taxon column (direct reads assigned to that taxon)
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

def find_path(name):
    if name in lookup:
        return lookup[name]
    name_lower = name.lower()
    for key, path in lookup.items():
        if key.lower() == name_lower:
            return path
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

# ── 5. Build the RPKM hierarchy ───────────────────────────────────────────────
#
# KEY DISTINCTION:
#   _direct_rpkm  = RPKM summed from THIS taxon's own column in RPKM_table
#                   (reads that MetaPro could only classify to this level)
#   _total_rpkm   = _direct_rpkm + all descendant _total_rpkm values
#                   (used for arc proportions in the sunburst chart)
#
# Example: Proteobacteria column has 6,000 RPKM (reads assigned only to phylum),
#          but Desulfovibrionaceae (a descendant) has 10,000 RPKM.
#          → Proteobacteria _direct_rpkm = 6,000
#          → Proteobacteria _total_rpkm  = 6,000 + 10,000 + (other descendants)

def insert_path(tree_dict, path, rpkm_value, percentage):
    """
    Insert a taxon into a nested dict structure.
    Each node tracks:
      _direct_rpkm  — RPKM from this taxon's own column (set only at the matched level)
      _total_rpkm   — accumulated total including all descendants
      _percentage   — fraction of total_rpkm across all taxa
    """
    node = tree_dict
    for i, level_name in enumerate(path):
        if level_name not in node:
            node[level_name] = {
                "_direct_rpkm": 0.0,
                "_total_rpkm":  0.0,
                "_percentage":  0.0,
                "_children":    {}
            }
        # Every ancestor accumulates the total
        node[level_name]["_total_rpkm"]  += rpkm_value
        node[level_name]["_percentage"]  += percentage

        # Only the deepest node in the path (the matched taxon itself) gets direct credit
        if i == len(path) - 1:
            node[level_name]["_direct_rpkm"] += rpkm_value

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
    """
    Convert the nested dict structure into JSON.
    Each node gets:
      - name, percentage (same as before)
      - direct_rpkm: RPKM assigned directly to this level (0 if none)
      - children OR value (value = _total_rpkm for leaf nodes)
    """
    children = []
    for child_name, child_data in node_dict["_children"].items():
        children.append(dict_to_json(child_name, child_data))

    result = {
        "name":         name,
        "percentage":   round(node_dict["_percentage"],  6),
        "direct_rpkm":  round(node_dict["_direct_rpkm"], 4),
    }

    if children:
        result["children"] = children
    else:
        # Leaf node: value drives arc size — use total (same as before)
        result["value"] = round(node_dict["_total_rpkm"], 4)

    return result

root_children = []
for phylum_name, phylum_data in tree_dict.items():
    root_children.append(dict_to_json(phylum_name, phylum_data))

rpkm_hierarchy = {
    "name":     "root",
    "children": root_children
}

# ── 6. Save ───────────────────────────────────────────────────────────────────
with open(output_path, "w") as f:
    json.dump(rpkm_hierarchy, f, indent=2)

print(f"\nSaved RPKM hierarchy to {output_path}")
print(f"  Top-level nodes: {[c['name'] for c in rpkm_hierarchy['children']]}")
print(f"  Total RPKM summed: {total_rpkm:.2f}")
