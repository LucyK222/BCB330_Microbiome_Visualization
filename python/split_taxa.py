import pandas as pd

# Load TSV file (no header)
df = pd.read_csv("./data/taxa_classifications.tsv", sep="\t", header=None)

# Rename columns for convenience
df.columns = ["Status", "ReadID", "Taxonomy"]


# Function to parse taxonomy
def split_taxonomy(tax_string):
    if tax_string.lower() == "unclassified":
        # Return 7 None values
        return pd.Series([None] * 7)

    # Split by semicolon
    parts = tax_string.split(";")

    # Remove the "root" entry if present
    if parts[0].strip().lower() == "root":
        parts = parts[1:]

    # Extract the rank after the prefix (e.g., "k_", "p_")
    cleaned = []
    for item in parts:
        if "_" in item:
            cleaned.append(item.split("_", 1)[1])
        else:
            cleaned.append(item)

    # Ensure exactly 7 columns (pad if needed)
    cleaned = cleaned + [None] * (7 - len(cleaned))
    return pd.Series(cleaned[:7])


# Apply to dataframe
taxonomy_cols = df["Taxonomy"].apply(split_taxonomy)

# Assign meaningful names
taxonomy_cols.columns = [
    "Kingdom", "Phylum", "Class", "Order", "Family", "Genus", "Species"
]

# Concatenate back
df = pd.concat([df, taxonomy_cols], axis=1)

# Save output
df.to_csv("./data/taxa_classifications_splited.tsv", sep="\t", index=False)
