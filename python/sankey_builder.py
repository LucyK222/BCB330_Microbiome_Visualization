import csv
import json
from collections import defaultdict
import pandas as pd

from python.EC_to_superpath import load_ec_to_map, load_map_to_superpathway, get_superpathway_for_ec


def build_sankey_for_taxon(
        rpkm_table_path,
        taxon_name,
        ec_to_map,
        map_to_super
):
    TYPE_TO_LAYER = {
        "taxa": 0,
        "ec": 1,
        "pathway": 2
    }

    df = pd.read_csv(rpkm_table_path, sep="\t")

    nodes = []
    links = []

    node_ids = set()

    def add_node(node_id, node_type):
        if node_id not in node_ids:
            nodes.append({
                "id": node_id,
                "type": node_type,
                "layer": TYPE_TO_LAYER[node_type]
            })
            node_ids.add(node_id)

    # 1. Add taxon node
    add_node(taxon_name, "taxa")

    # EC → superpathway accumulated RPKM
    ec_to_super_rpkm = defaultdict(lambda: defaultdict(float))

    # 2–3. Taxon → EC
    for _, row in df.iterrows():
        ec_raw = row["EC#"]
        rpkm = row["RPKM"]
        taxon_value = row[taxon_name]

        if taxon_value == 0:
            continue
        if ec_raw == "0.0.0.0":
            continue

        # 🔹 Handle multiple ECs
        ecs = ec_raw.split("|")
        split_rpkm = rpkm / len(ecs)

        for ec in ecs:
            ec = ec.strip()
            add_node(ec, "ec")

            links.append({
                "source": taxon_name,
                "target": ec,
                "value": split_rpkm
            })

            # 4. EC → superpathway
            superpaths = get_superpathway_for_ec(ec, ec_to_map, map_to_super)
            for sp in superpaths:
                ec_to_super_rpkm[ec][sp] += split_rpkm

    # 5–6. EC → superpathway links
    for ec, sp_dict in ec_to_super_rpkm.items():
        for sp, total_rpkm in sp_dict.items():
            add_node(sp, "pathway")
            links.append({
                "source": ec,
                "target": sp,
                "value": total_rpkm
            })

    return {
        "nodes": nodes,
        "links": links
    }

ec_to_map = load_ec_to_map("../databases/EC_pathway.txt")
map_to_super = load_map_to_superpathway("../databases/pathway_to_superpathway.csv")

sankey_data = build_sankey_for_taxon(
    rpkm_table_path="../databases/RPKM_table.tsv",
    taxon_name="Firmicutes bacterium ASF500",
    ec_to_map=ec_to_map,
    map_to_super=map_to_super
)

# Write to JSON for D3
with open("../data/sankey_Firmicutes_ASF500.json", "w") as f:
    json.dump(sankey_data, f, indent=2)