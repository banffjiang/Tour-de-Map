// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiYmFuZmZqaWFuZyIsImEiOiJjbTdja3NyaTcwcHE1MnBvY3ducGRidDRxIn0.l8GsCpwctn15F-iZov3jUQ';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

const svg = d3.select('#map')
    .append('svg')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none');

let trips = [];
let stations = [];
let departures = new Map();
let arrivals = new Map();

let filteredTrips = [];
let filteredStations = [];
let filteredDepartures = new Map();
let filteredArrivals = new Map();

let timeFilter = -1;

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function getCoords(station) {
    if (!station.lon || !station.lat) return { cx: -100, cy: -100 };
    const point = map.project([+station.lon, +station.lat]);
    return { cx: point.x, cy: point.y };
}

function updatePositions(radiusScale) {
    svg.selectAll('circle')
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy)
        .attr('r', d => radiusScale(d.totalTraffic));
}

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function filterTripsbyTime() {
    filteredTrips = timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
      });

    filteredDepartures = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.start_station_id
    );
  
    filteredArrivals = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.end_station_id
    );

    filteredStations = stations.map(station => {
        const newStation = { ...station };
        let id = newStation.short_name;
        newStation.departures = filteredDepartures.get(id) ?? 0;
        newStation.arrivals = filteredArrivals.get(id) ?? 0;
        newStation.totalTraffic = newStation.departures + newStation.arrivals;
        return newStation;
    });

    updateVisualization();
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
    } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
    }

    filterTripsbyTime();
}

function updateVisualization() {
    const tooltip = d3.select("#tooltip");

    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
        .range(timeFilter === -1 ? [0, 25] : [3, 50]);

    svg.selectAll("circle")
        .data(filteredStations)
        .join("circle")
        .attr("r", d => radiusScale(d.totalTraffic))
        .style("--departure-ratio", d => 
            d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5
    )
    .on("mouseover", (event, d) => {
        tooltip.style("display", "block")
            .html(`${d.totalTraffic} Trips<br> ${d.departures} Departures<br> ${d.arrivals} Arrivals`);
    })
    .on("mousemove", (event) => {
        tooltip.style("left", `${event.pageX + 10}px`)
               .style("top", `${event.pageY - 20}px`);
    })
    .on("mouseout", () => {
        tooltip.style("display", "none");
    });

    updatePositions(radiusScale);
}

map.on('load', () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 5,
            'line-opacity': 0.6
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 5,
            'line-opacity': 0.6
        }
    });

    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    d3.json(jsonurl).then(jsonData => {
        stations = jsonData.data.stations;

        const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        d3.csv(trafficUrl).then(tripsData => {
            trips = tripsData.map(trip => ({
                ...trip,
                started_at: new Date(trip.started_at),
                ended_at: new Date(trip.ended_at)
            }));

            departures = d3.rollup(
                trips,
                v => v.length,
                d => d.start_station_id
            );

            arrivals = d3.rollup(
                trips,
                v => v.length,
                d => d.end_station_id
            );

            stations = stations.map(station => {
                let id = station.short_name;
                station.departures = departures.get(id) ?? 0;
                station.arrivals = arrivals.get(id) ?? 0;
                station.totalTraffic = station.departures + station.arrivals;
                return station;
            });

            filteredStations = [...stations];
            filterTripsbyTime(); 

            const radiusScale = d3.scaleSqrt()
                .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
                .range(timeFilter === -1 ? [0, 25] : [3, 50]);

            const colorScale = d3.scaleLinear()
                .domain([0, 1])
                .range(['darkorange', 'steelblue']);
            
            const circles = svg.selectAll('circle')
                .data(filteredStations)
                .enter()
                .append('circle')
                .style("--departure-ratio", d => 
                    d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5
                );

            updatePositions(radiusScale);

            map.on('move', () => updatePositions(radiusScale));
            map.on('zoom', () => updatePositions(radiusScale));
            map.on('resize', () => updatePositions(radiusScale));
            map.on('moveend', () => updatePositions(radiusScale));

            timeSlider.addEventListener('input', updateTimeDisplay);

            updateTimeDisplay();

        }).catch(error => {
            console.error("Error Loading Trip Data:", error);
        });
    }).catch(error => {
        console.error("Error Loading JSON:", error);
    });
});