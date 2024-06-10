import {
    formatUnixTimestamp, kelvinToFahrenheit,
    getIconForWeatherId, getDayOfWeekFromTimestamp,
    getColorsForIcon, capitalizeFirstLetters
} from "./utility.js";

const API_KEY = "ODgzM2Y5NDI1MjI0NTI3NjIwMmZlYzg5MDUzMDNiODQ=";
const MAX_CACHE_AGE = 60 * 60 * 1000; // 1 Hour cache
const badCityRequests = [];
const CITIES = {
    NEW_YORK: "new_york",
    ATLANTA: "atlanta",
    AUSTIN: "austin",
    CHICAGO: "chicago",
    DENVER: "denver",
    ORLANDO: "orlando",
    SAN_FRANCISCO: "san_francisco",
    SEATTLE: "seattle"
};

const cityCoordinates = {
    [CITIES.NEW_YORK]:      { latitude: 40.7128, longitude: -74.0060 },
    [CITIES.ATLANTA]:       { latitude: 33.7490, longitude: -84.3880 },
    [CITIES.AUSTIN]:        { latitude: 30.2672, longitude: -97.7431 },
    [CITIES.CHICAGO]:       { latitude: 41.8781, longitude: -87.6298 },
    [CITIES.DENVER]:        { latitude: 39.7392, longitude: -104.9903 },
    [CITIES.ORLANDO]:       { latitude: 28.5383, longitude: -81.3792 },
    [CITIES.SAN_FRANCISCO]: { latitude: 37.7749, longitude: -122.4194 },
    [CITIES.SEATTLE]:       { latitude: 47.6062, longitude: -122.3321 }
};

// Checks cached data for a specific city
function getWeatherFromStorage(city) {
    return JSON.parse(localStorage.getItem('cache_' + city));
}

// Return from localStorage cities that were not part of the original CITIES object
function getCustomCities() {
    return JSON.parse(localStorage.getItem("cached_cities")) || {};
}

// Get the coordinates for a custom city from localStorage
function getCustomCity(city) {
    // Check if it's a custom city we already have a record for
    const cachedCities = getCustomCities() || {};
    return cachedCities[city];
}

// Save the coordinates for a custom city to localStorage
function setCustomCity(city, coordinates) {
    // Check if it's a custom city we already have a record for
    const cachedCities = getCustomCities() || {};
    cachedCities[city] = coordinates;

    localStorage.setItem('cached_cities', JSON.stringify(cachedCities));
}

async function getCustomCityCoordinates(city) {
    // Check if this is a bad request and if so, stop here
    if (badCityRequests.includes(city)) { return; }

    // Try to get the coordinates from localStorage
    const localCoordinates = getCustomCity(city);
    // If they exist, return them
    if (localCoordinates) { return localCoordinates; }

    // Make the API request
    const request = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${city},US&appid=${atob(API_KEY)}`);
    if (!request.ok) { return; }

    const response = await request.json();
    // This means no results were found for this search. Likely not a city name
    if (response.length <= 0) {
        badCityRequests.push(city);
        return;
    }

    const likelyCity = response[0];
    // For the time being. We only allow US-based cities
    if (likelyCity.country !== 'US') {
        badCityRequests.push(city);
        return;
    }

    const coordinates = { latitude: likelyCity.lat, longitude: likelyCity.lon };
    // Save the new coordinates to localStorage for future requests
    setCustomCity(city, coordinates);
    return coordinates;
}

async function getWeatherFromAPI(city) {
    // Try to transform the city name into a possible key of the CITIES object
    city = city.trim().toLowerCase().replace(" ", "_");

    const now = Date.now();
    // Check if we have any data stored in the cache for this city
    let cachedWeather = getWeatherFromStorage(city);

    // If we do, check that it hasnt expired
    if (cachedWeather && (now - MAX_CACHE_AGE) < cachedWeather.time) {
        // Return the cached data
        return cachedWeather.data;
    }

    // Determine whether or not this is a custom city
    const isCustomCity = !Object.values(CITIES).includes(city);

    // Get the coordinates for the given city
    const coordinates = isCustomCity
        // This will either get the coordinates from localStorage
        // or make an API request
        ? (await getCustomCityCoordinates(city))
        // This uses the local coordinates we have stored
        : cityCoordinates[city];

    // Make a call to OpenWeather
    const baseURL = "https://api.openweathermap.org/data/2.5/forecast";
    const request = await fetch(`${baseURL}?lat=${coordinates.latitude}&lon=${coordinates.longitude}&appid=${atob(API_KEY)}`);

    if (!request.ok) {
        alert("Failed to fetch new data!");
        return;
    }

    const response = await request.json();
    // Cache the data
    localStorage.setItem('cache_' + city, JSON.stringify({
        time: now,
        data: { city: response.city, list: response.list }
    }));
    
    return response;
}

async function updateWeatherDashboard(cityName) {
    // Make loading more visually appealing
    $('#weather-display').addClass('loading');

    // Get the weather information for this city
    const { city, list } = await getWeatherFromAPI(cityName) || {};

    // This means we dont have data to show
    if (!city || !list ) { return; }

    // Remove the loading once we've got our data
    $('#weather-display').removeClass('loading');

    // Initialize our array of forecasts to 5
    const dailyForecasts = new Array(5);

    for (let i = 0; i < dailyForecasts.length; i++) {
        /**
         * `list` is an array of 40 previous forecasts.
         * Each element is a 3-hour period. To get the
         * forecasts for the 4 previous days, we increase
         * the index in multiples of 8 (24 / 3 = 8)
        */
        dailyForecasts[i] = list[i * 8];
    }

    // Update the current city forecast card
    const currentForecast = dailyForecasts[0];
    const currentCityForecastEl = $('#current-city-forecast');
    const fiveDayForecastEl = $('#forecast-list');
    const weatherIcon = getIconForWeatherId(currentForecast.weather[0].icon);

    // Update the current forecast element
    currentCityForecastEl.html(
        `<h2>
            ${city.name}
            (${formatUnixTimestamp(currentForecast.dt * 1000)})
        </h2>
        <p>Temp: ${kelvinToFahrenheit(currentForecast.main.temp)}&#x00B0; F</p>
        <p>Wind: ${currentForecast.wind.speed} MPH</p>
        <p>Humidity: ${currentForecast.main.humidity} %</p>
        <span>${weatherIcon}</p>`
    );
    
    const cardStyling = getColorsForIcon(weatherIcon);
    // Set the border and background information dynamically
    currentCityForecastEl.attr('data-background', cardStyling.background);
    currentCityForecastEl.css('--background', currentCityForecastEl.attr('data-background'));
    currentCityForecastEl.attr('data-border', cardStyling.border);
    currentCityForecastEl.css('--border-color', currentCityForecastEl.attr('data-border'));
    
    // Empty the 5-day forecast list before adding elements to this
    fiveDayForecastEl.empty();

    for (const forecast of dailyForecasts) {
        const unixTimestamp = forecast.dt * 1000;
        const weatherIcon = getIconForWeatherId(forecast.weather[0].icon);
        const cardStyling = getColorsForIcon(weatherIcon);

        const forecastEl = $(`<li class="card primary" 
            data-background="${cardStyling.background}" 
            data-border="${cardStyling.border}">
            <h3>${formatUnixTimestamp(unixTimestamp)}</h3>
            <h4>${getDayOfWeekFromTimestamp(unixTimestamp)}</h4>
            <p>${weatherIcon}</p>
            <p>Temp: ${kelvinToFahrenheit(forecast.main.temp)}&#x00B0; F</p>
            <p>Wind: ${forecast.wind.speed} MPH</p>
            <p>Humidity: ${forecast.main.humidity} %</p>
        </li>`);

        // We set these as attributes and not direct css stylings
        // so that we can also use them in hover states
        forecastEl.css('--background', forecastEl.attr('data-background'));
        forecastEl.css('--border-color', forecastEl.attr('data-border'));
        fiveDayForecastEl.append(forecastEl);
    }

    // Get the search history of cities
    const commonCitiesList = $('#common-cities-list');
    commonCitiesList.empty();

    // Get the ids of all of the cities we have
    const cities = [
        // Get the custom cities we have in localStorage
        // Having this one first will allow us to see the custom cities first
        // like a search history although Object.keys() does not guarantee order
        ...Object.keys(getCustomCities() || {}).reverse(),
        // Get the cities we have in our CITIES object
        ...Object.values(CITIES)
    ];

    for (const city of cities) {
        commonCitiesList.append(`<li><button>${capitalizeFirstLetters(city.replace("_", " "))}</button></li>`);
    }

    // Scroll to the weather display area
    // Has no effect on desktop view
    $('html, body').animate({
        scrollTop: $("#weather-display").offset().top
    }, 1000);
}

function handleWeatherSearch(e) {
    e.preventDefault();

    const cityNameEl = $(this).find('input[name="city-name"]');
    const cityName = cityNameEl.val();
    if (!cityName) { return; }

    cityNameEl.val('');
    updateWeatherDashboard(cityName);
}

function handleCityClick() {
    const cityName = $(this).text();
    if (!cityName) { return; }

    updateWeatherDashboard(cityName);
}

// Event listeners
// Triggered when the user searches for something on the cities form
$('#search-city-form').on('submit', handleWeatherSearch);
// Triggered when the user clicks on a city in the search history
$('#common-cities-list').on('click', 'button', handleCityClick);

$(document).ready(() => updateWeatherDashboard(CITIES.ATLANTA));