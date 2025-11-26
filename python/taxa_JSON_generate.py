import pandas as pd
import json

# ---- 1. Load your processed file ----
df = pd.read_csv("../data/taxa_classifications_splited.tsv", sep="\t")

df["Class"] = df["Class"].replace("", pd.NA).fillna("Unclassified Classes")
df["Order"] = df["Order"].replace("", pd.NA).fillna("Unclassified Orders")
df["Family"] = df["Family"].replace("", pd.NA).fillna("Unclassified Family")
df["Genus"] = df["Genus"].replace("", pd.NA).fillna("Unclassified Genera")
df["Species"] = df["Species"].replace("", pd.NA).fillna("Unclassified Species")

# Keep only classified entries (Status == "C") and with genus information
# TODO: directly dropping the "U" since there's nearly half of them, which would make the chart ugly
# TODO: keep only kingdom bacteria
# TODO: should unclassified also be in the denominator?
# TODO: inside the unclassified, there might also be classified lower taxa
df = df[(df["Status"] == "C") & (df["Kingdom"] == "Bacteria")]
total_reads = len(df)

# ---- 2. Collapse Phyla into major groups ----
major_phyla = ["Firmicutes", "Bacteroidetes", "Proteobacteria", "Actinobacteria"]

df["Phylum_collapsed"] = df["Phylum"].apply(
    lambda x: x if x in major_phyla else "Other Phyla"
)

# ---- 3. Keep only top 10 genera ----
top10 = df["Genus"].value_counts().nlargest(11).index.tolist()

df["Genus_collapsed"] = df["Genus"].apply(
    lambda x: x if x in top10 else "Other Genera"
)

# ---- 3. Keep only top 20 species ----
top20_species = df["Species"].value_counts().nlargest(20).index.tolist()

df["Species_collapsed"] = df["Species"].apply(
    lambda x: x if x in top20_species else "Other Species"
)

# ---- 4. Aggregate read counts ----
summary = (
    df.groupby(["Phylum_collapsed", "Genus_collapsed", "Species_collapsed"])
    .size()
    .reset_index(name="count")
)

summary["percentage"] = summary["count"] / summary["count"].sum()
# ---- 5. Convert to hierarchical JSON ----
def build_hierarchy(df):
    hierarchy = {"name": "root", "children": []}

    for kingdom in df["Kingdom"].unique():
        k_node = {"name": kingdom, "children": []}
        df_k = df[df["Kingdom"] == kingdom]

        for phylum in df_k["Phylum_collapsed"].unique():
            p_node = {"name": phylum, "children": []}
            df_p = df_k[df_k["Phylum_collapsed"] == phylum]

            for genus, count in zip(df_p["Genus_collapsed"], df_p["count"]):
                g_node = {"name": genus, "value": int(count)}
                p_node["children"].append(g_node)

            k_node["children"].append(p_node)

        hierarchy["children"].append(k_node)

    return hierarchy


def build_hierarchy_2(df):
    hierarchy = {"name": "root", "children": []}

    for phylum in df["Phylum_collapsed"].unique():
        p_node = {"name": phylum, "percentage": 0, "children": []}
        df_p = df[df["Phylum_collapsed"] == phylum]

        for genus in df_p["Genus_collapsed"].unique():
            g_node = {"name": genus, "percentage": 0, "children": []}
            df_g = df_p[df_p["Genus_collapsed"] == genus]

            for _, row in df_g.iterrows():
                s_node = {
                    "name": row["Species_collapsed"],
                    "value": int(row["count"]),
                    "percentage": float(row["percentage"])
                }
                g_node["children"].append(s_node)
                g_node["percentage"] += float(row["percentage"])

            p_node["children"].append(g_node)
            p_node["percentage"] += g_node["percentage"]

        hierarchy["children"].append(p_node)

    return hierarchy

sunburst_json = build_hierarchy_2(summary)

# ---- 6. Save it ----
with open("../data/taxa.json", "w") as f:
    json.dump(sunburst_json, f, indent=2)

# sunburst_json
