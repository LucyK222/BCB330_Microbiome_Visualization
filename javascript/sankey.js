var margin = { top: 10, right: 10, bottom: 10, left: 10 },
    width = 450 - margin.left - margin.right,
    height = 480 - margin.top - margin.bottom;

var tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("padding", "6px 10px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

var svg = d3.select("#my_dataviz").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

var g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var zoomLayer = g.append("g");

var zoom = d3.zoom()
    .scaleExtent([0.5, 6])   // min / max zoom
    .on("zoom", function (event) {
        zoomLayer.attr("transform", event.transform);
    });

svg.call(zoom);

var color = d3.scaleOrdinal()
    .domain(["taxa", "ec", "pathway"])
    .range(["#4C78A8", "#F58518", "#54A24B"]);


var sankey = d3.sankey()
    .nodeWidth(20)
    .nodePadding(10)
    // .nodeAlign(d => {
    //     if (d.type === "taxa") return 0;
    //     if (d.type === "ec") return 1;
    //     if (d.type === "pathway") return 2;
    //     return 1;
    // })
    .nodeAlign(d3.sankeyLeft)
    // .nodeSort((a, b) => {
    //     if (a.layer !== b.layer) return a.layer - b.layer;
    //     return d3.ascending(a.id, b.id);
    // })
    .extent([[0, 0], [width, height]]);

sankey.nodeId(d => d.id);

d3.json("./data/sankey_Firmicutes_ASF500.json").then(function(graph) {

    var data = sankey(graph);

    zoomLayer.append("g")
        .selectAll("path")
        .data(data.links)
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.sankeyLinkHorizontal())
        .style("stroke-width", d => Math.max(1, d.width))
        .on("mouseover", function (event, d) {
            tooltip
                .style("opacity", 1)
                .html(`
        <strong>Pathway flow</strong><br/>
        ${d.source.id} → ${d.target.id}<br/>
        Value: ${d.value}
      `);
        })
        .on("mousemove", function (event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("opacity", 0);
        });

    var node = zoomLayer.append("g")
        .selectAll("g")
        .data(data.nodes)
        .enter().append("g");

    node.on("mouseover", function (event, d) {
        tooltip
            .style("opacity", 1)
            .html(`
              <strong>${d.type}</strong><br/>
              Name: ${d.id}<br/>
              Total RPKM: ${d.value}
            `);
        })
        .on("mousemove", function (event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("opacity", 0);
        });

    node.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        // .attr("height", d => d.y1 - d.y0)
        .attr("height", d => Math.max(4, d.y1 - d.y0))
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => color(d.type))
        .attr("stroke", "#333")
        .attr("stroke-width", 0.5);


    node.raise();
    // node.append("text")
    //     .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    //     .attr("y", d => (d.y0 + d.y1) / 2)
    //     .attr("dy", "0.35em")
    //     .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    //     .text(d => d.id);

});

