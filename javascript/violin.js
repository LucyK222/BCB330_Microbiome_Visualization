// set dimensions
var margin = {top: 10, right: 30, bottom: 120, left: 60},
    width = 900 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// create svg
var svg = d3.select("#my_dataviz")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// load your CSV
d3.csv("data/violin_Dorea_sp_5_2.csv").then(function(data) {
    console.log("Loaded data:", data);
    // convert RPKM to numbers
    data.forEach(d => { d.RPKM = +d.RPKM; });

    // X scale: superpathways
    var x = d3.scaleBand()
        .range([0, width])
        .domain([...new Set(data.map(d => d.superpathway))])
        .padding(0.05);
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-40)");

    // Y scale: RPKM values
    var y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.RPKM) * 1.1]) // leave some space on top
        .range([height, 0]);
    svg.append("g").call(d3.axisLeft(y));

    // histogram generator
    var histogram = d3.histogram()
        .domain(y.domain())
        .thresholds(y.ticks(20))
        .value(d => d);

    // group data by superpathway
    var sumstat = d3.nest()
        .key(d => d.superpathway)
        .rollup(function(d) {
            var input = d.map(g => g.RPKM);
            return histogram(input);
        })
        .entries(data);

    // max number of values in a bin
    var maxNum = 0;
    sumstat.forEach(function(d){
        var lengths = d.value.map(a => a.length);
        var longest = d3.max(lengths);
        if(longest > maxNum) maxNum = longest;
    });

    // X scale for violin width
    var xNum = d3.scaleLinear()
        .range([0, x.bandwidth()])
        .domain([-maxNum, maxNum]);

    // draw violins
    svg.selectAll("myViolin")
        .data(sumstat)
        .enter()
        .append("g")
        .attr("transform", d => "translate(" + x(d.key) + ",0)")
        .append("path")
        .datum(d => d.value)
        .style("stroke", "none")
        .style("fill", "#69b3a2")
        .attr("d", d3.area()
            .x0(d => xNum(-d.length))
            .x1(d => xNum(d.length))
            .y(d => y(d.x0))
            .curve(d3.curveCatmullRom)
        );

});