import pandas as pd
import json

# ---- 1. Load & clean ----
df = pd.read_csv("../data/taxa_classifications_splited.tsv", sep="\t")

# Fill empty taxonomy fields with "Unclassified X"
df["Phylum"]  = df["Phylum"].replace("", pd.NA).fillna("Unclassified Phylum")
df["Class"]   = df["Class"].replace("", pd.NA).fillna("Unclassified Class")
df["Order"]   = df["Order"].replace("", pd.NA).fillna("Unclassified Order")
df["Family"]  = df["Family"].replace("", pd.NA).fillna("Unclassified Family")
df["Genus"]   = df["Genus"].replace("", pd.NA).fillna("Unclassified Genus")
df["Species"] = df["Species"].replace("", pd.NA).fillna("Unclassified Species")

# Keep only classified Bacteria (fixed filters — collapsing is done in the browser)
df = df[(df["Status"] == "C") & (df["Kingdom"] == "Bacteria")]

total_reads = len(df)
print(f"Total classified bacterial reads: {total_reads}")

# ---- 2. Aggregate read counts at full depth ----
# Full hierarchy: Phylum → Class → Order → Family → Genus → Species
summary = (
    df.groupby(["Phylum", "Class", "Order", "Family", "Genus", "Species"], dropna=False)
    .size()
    .reset_index(name="count")
)

summary["percentage"] = summary["count"] / total_reads

# ---- 3. Build full unfiltered hierarchy ----
def build_hierarchy(df):
    """
    Builds a full nested JSON tree:
    root → Phylum → Class → Order → Family → Genus → Species

    No collapsing is done here — all filtering (top N per level, min reads, etc.)
    is handled dynamically in the browser via JavaScript sliders.

    Each leaf node (Species) contains:
      - name: species name
      - value: read count
      - percentage: fraction of total classified bacterial reads

    Each internal node contains:
      - name: taxon name
      - percentage: cumulative percentage of all descendant reads
      - children: list of child nodes
    """
    hierarchy = {"name": "root", "children": []}

    for phylum, df_p in df.groupby("Phylum"):
        p_node = {"name": phylum, "percentage": 0.0, "children": []}

        for cls, df_c in df_p.groupby("Class"):
            c_node = {"name": cls, "percentage": 0.0, "children": []}

            for order, df_o in df_c.groupby("Order"):
                o_node = {"name": order, "percentage": 0.0, "children": []}

                for family, df_f in df_o.groupby("Family"):
                    f_node = {"name": family, "percentage": 0.0, "children": []}

                    for genus, df_g in df_f.groupby("Genus"):
                        g_node = {"name": genus, "percentage": 0.0, "children": []}

                        for _, row in df_g.iterrows():
                            s_node = {
                                "name":       row["Species"],
                                "value":      int(row["count"]),
                                "percentage": float(row["percentage"])
                            }
                            g_node["children"].append(s_node)
                            g_node["percentage"] += float(row["percentage"])

                        f_node["children"].append(g_node)
                        f_node["percentage"] += g_node["percentage"]

                    o_node["children"].append(f_node)
                    o_node["percentage"] += f_node["percentage"]

                c_node["children"].append(o_node)
                c_node["percentage"] += o_node["percentage"]

            p_node["children"].append(c_node)
            p_node["percentage"] += c_node["percentage"]

        hierarchy["children"].append(p_node)

    return hierarchy


full_hierarchy = build_hierarchy(summary)

# ---- 4. Save ----
output_path = "../data/taxa_complete.json"
with open(output_path, "w") as f:
    json.dump(full_hierarchy, f, indent=2)

print(f"Saved full hierarchy to {output_path}")
print(f"  Phyla:   {len(full_hierarchy['children'])}")
print(f"  Species: {len(summary)}")

total_pct = sum(p["percentage"] for p in full_hierarchy["children"])
print(f"Sum of all phylum percentages: {total_pct:.6f}")

# Also check raw
print(f"Sum of all species percentages: {summary['percentage'].sum():.6f}")