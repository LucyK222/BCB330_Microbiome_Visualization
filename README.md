# BCB330_Microbiome_Visualization

## Charts

Krona Chart:

1. based on taxa_classification.tsv from MetaPro

2. basic tooltip hovering interaction

3. showing phylum, genus and species

4. can choose threshold for subsetting genus and species

5. https://observablehq.com/@d3/zoomable-sunburst

6. "Other Phyla" means the phylum that's low in composition and collapsed by the slider restriction. And the composition under "Other Phlya" won't be shown.

7. "Unclassified Phyla" means the phylum that's unidentified, or the classified class has unidentified phyla in taxanomy (NCBI?). So there might be classified species with unclassified class.

8. "Top N classes" means the top N classes within a phyla.



Violin Chart:

1. based on RPKM table (need to change to taxa_classification)


Stacked Composition Chart:

1. Why sum of RPKM value is decreasing: the result of cutoff is mixed, so there are empty sections in the krona charts.

2. No top N cut off.

3. Based on taxa_rpkm.json used for RPKM Krona.

4. The percentage is calculated after the 1% cut off. (denominator is not the whole population)


## Python Functions

split_taxa.py: process taxa_classification.tsv (output of MetaPro) to taxa_classification_split.tsv
