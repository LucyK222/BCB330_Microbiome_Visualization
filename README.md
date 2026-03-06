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

8. Why RPKM-Krona chart is not full circle: RPKM_table.tsv has a 1% cut-off. In order to show the true proportion of the taxa in the whole sample, there are archs not full circles.

9. "Top N classes" means the top N classes within a phyla.



Violin Chart:

1. based on RPKM table (need to change to taxa_classification)


Stacked Composition Chart:

1. Why sum of RPKM value is decreasing: the result of cutoff is mixed, so there are empty sections in the krona charts.


## Python Functions

split_taxa.py: process taxa_classification.tsv (output of MetaPro) to taxa_classification_split.tsv
