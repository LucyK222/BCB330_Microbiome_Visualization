import pandas as pd

from python.EC_to_superpath import (
    load_ec_to_map,
    load_map_to_superpathway,
    get_superpathway_for_ec
)

def build_superpathway_rpkm_table(
        rpkm_table_path,
        taxon_name,
        ec_to_map,
        map_to_super
):
    # 1. Load table
    df = pd.read_csv(rpkm_table_path, sep="\t")

    # 2. Filter rows
    df = df[
        (df["EC#"] != "0.0.0.0") &
        (df[taxon_name] != 0)
        ]

    # 3. Keep only EC# and RPKM
    df = df[["EC#", "RPKM"]]

    rows = []

    # 4. Expand EC → superpathway
    for _, row in df.iterrows():
        ec_raw = row["EC#"]
        rpkm = row["RPKM"]

        # Handle multiple ECs: 1.2.3.4|5.6.7.8
        ecs = ec_raw.split("|")

        for ec in ecs:
            ec = ec.strip()

            superpaths = get_superpathway_for_ec(
                ec,
                ec_to_map,
                map_to_super
            )

            for sp in superpaths:
                rows.append({
                    "superpathway": sp,
                    "RPKM": rpkm
                })

    # 5. Final dataframe
    return pd.DataFrame(rows)


ec_to_map = load_ec_to_map("../databases/EC_pathway.txt")
map_to_super = load_map_to_superpathway("../databases/pathway_to_superpathway.csv")

df_violin = build_superpathway_rpkm_table(
    rpkm_table_path="../databases/RPKM_table.tsv",
    taxon_name="Dorea sp. 5-2",
    ec_to_map=ec_to_map,
    map_to_super=map_to_super
)

df_violin.to_csv("../data/violin_Dorea_sp_5_2.csv", index=False)
