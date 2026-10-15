/* Configure sua chave no campo abaixo antes de usar a consulta meteorológica. */
const OPENWEATHER_API_KEY = "COLOQUE_SUA_API_KEY_AQUI"; // Exemplo: "1234567890abcdef1234567890abcdef"
const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";

const TOPICS = {
  temperature: "esp32/clima/temperatura",
  humidity: "esp32/clima/umidade",
  currentCity: "esp32/clima/cidadeAtual",
  requestedCity: "esp32/clima/cidade"
};

const $ = (id) => document.getElementById(id);
const elements = {
  form: $("searchForm"),
  city: $("cityInput"),
  country: $("countrySelect"),
  searchButton: $("searchButton"),
  status: $("statusMessage"),
  lastUpdate: $("lastUpdate"),
  favoriteButton: $("favoriteButton"),
  favoriteCity: $("favoriteCity"),
  loadFavoriteButton: $("loadFavoriteButton"),
  historyList: $("historyList"),
  mqttBadge: $("mqttBadge"),
  mqttStatus: $("mqttStatus"),
  mqttLastMessage: $("mqttLastMessage"),
  themeToggle: $("themeToggle")
};

let mqttClient = null;
let weatherChart = null;
let currentWeather = null;
let currentSearch = null;
let historyItems = [];

function showMessage(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = `status-message ${type}`.trim();
}

function setLoading(isLoading) {
  elements.searchButton.disabled = isLoading;
  elements.searchButton.textContent = isLoading ? "Consultando..." : "⌕ Consultar clima";
  if (isLoading) showMessage("Consultando dados meteorológicos...", "loading");
}

function formatTime(timestamp, timezoneOffset = 0) {
  return new Date((timestamp + timezoneOffset) * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
}

function formatDateTime(date = new Date()) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function getWindDirection(degrees) {
  if (typeof degrees !== "number") return "Direção não informada";
  const directions = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return directions[Math.round(degrees / 45) % 8];
}

function getWeatherTheme(main) {
  const condition = (main || "").toLowerCase();
  if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("thunderstorm")) return "rain";
  if (condition.includes("cloud")) return "cloud";
  if (condition.includes("snow")) return "snow";
  if (condition.includes("clear")) return "clear";
  return "default";
}

function applyWeatherTheme(main) {
  const themes = {
    clear: ["#f5a623", "#fff2d7"],
    rain: ["#40618e", "#e4edfa"],
    cloud: ["#657a9a", "#e8eef7"],
    snow: ["#4c92bd", "#e1f5ff"],
    default: ["#3767e8", "#eaf1ff"]
  };
  const theme = themes[getWeatherTheme(main)] || themes.default;
  document.documentElement.style.setProperty("--weather-accent", theme[0]);
  document.documentElement.style.setProperty("--weather-tint", theme[1]);
  document.querySelector(".hero").style.background =
    getWeatherTheme(main) === "rain"
      ? "linear-gradient(115deg, #172b4d, #42658f 65%, #8ba6c9)"
      : getWeatherTheme(main) === "cloud"
        ? "linear-gradient(115deg, #34445f, #687f9f 65%, #9aacc5)"
        : getWeatherTheme(main) === "clear"
          ? "linear-gradient(115deg, #173577, #3267d8 58%, #f0b54e)"
          : "linear-gradient(115deg, #173577 0%, #3267d8 58%, #6fa9f7 100%)";
}

function initializeChart() {
  const context = $("weatherChart").getContext("2d");
  weatherChart = new Chart(context, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperatura (°C)", data: [], yAxisID: "temperature",
          borderColor: "#e85d75", backgroundColor: "rgba(232,93,117,.12)",
          pointRadius: 3, pointHoverRadius: 5, tension: .35, fill: true
        },
        {
          label: "Umidade (%)", data: [], yAxisID: "humidity",
          borderColor: "#3977e8", backgroundColor: "rgba(57,119,232,.08)",
          pointRadius: 3, pointHoverRadius: 5, tension: .35, fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7, padding: 18 } },
        tooltip: { padding: 12 }
      },
      scales: {
        x: { title: { display: true, text: "Consultas recentes" }, grid: { display: false } },
        temperature: {
          type: "linear", position: "left", min: -10,
          title: { display: true, text: "Temperatura (°C)" }
        },
        humidity: {
          type: "linear", position: "right", min: 0, max: 100,
          title: { display: true, text: "Umidade (%)" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function updateChart(weather) {
  const label = `${weather.city} · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  weatherChart.data.labels.push(label);
  weatherChart.data.datasets[0].data.push(weather.temperature);
  weatherChart.data.datasets[1].data.push(weather.humidity);
  while (weatherChart.data.labels.length > 12) {
    weatherChart.data.labels.shift();
    weatherChart.data.datasets.forEach(dataset => dataset.data.shift());
  }
  weatherChart.update();
}

function displayWeather(data, country) {
  const weather = {
    city: data.name,
    country,
    temperature: data.main.temp,
    feelsLike: data.main.feels_like,
    min: data.main.temp_min,
    max: data.main.temp_max,
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind: (data.wind?.speed ?? 0) * 3.6,
    windDegrees: data.wind?.deg,
    description: data.weather?.[0]?.description ?? "Condição não informada",
    main: data.weather?.[0]?.main ?? "",
    sunrise: data.sys?.sunrise,
    sunset: data.sys?.sunset,
    timezone: data.timezone ?? 0,
    timestamp: data.dt
  };
  currentWeather = weather;
  currentSearch = { city: data.name, country };

  $("temperature").innerHTML = `${Math.round(weather.temperature)}<span> °C</span>`;
  $("humidity").innerHTML = `${weather.humidity}<span> %</span>`;
  $("wind").innerHTML = `${weather.wind.toFixed(1)}<span> km/h</span>`;
  $("windDirection").textContent = `Direção: ${getWindDirection(weather.windDegrees)}`;
  $("feelsLike").innerHTML = `${Math.round(weather.feelsLike)}<span> °C</span>`;
  $("minMax").innerHTML = `${Math.round(weather.min)} / ${Math.round(weather.max)}<span> °C</span>`;
  $("pressure").innerHTML = `${weather.pressure}<span> hPa</span>`;
  $("location").textContent = `${weather.city}, ${country}`;
  $("weatherDescription").textContent = weather.description.charAt(0).toUpperCase() + weather.description.slice(1);
  $("sunTimes").textContent = `${formatTime(weather.sunrise, weather.timezone)} / ${formatTime(weather.sunset, weather.timezone)}`;
  elements.lastUpdate.textContent = `Última atualização: ${formatDateTime()}`;
  elements.favoriteButton.disabled = false;
  applyWeatherTheme(weather.main);
  updateChart(weather);
  addToHistory(weather);
}

async function fetchWeather(city, country) {
  if (!city.trim()) {
    showMessage("Informe uma cidade antes de realizar a consulta.", "error");
    elements.city.focus();
    return;
  }
  if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === "COLOQUE_SUA_API_KEY_AQUI") {
    showMessage("Configure sua API Key da OpenWeatherMap no arquivo script.js.", "error");
    return;
  }

  setLoading(true);
  try {
    const url = new URL(OPENWEATHER_URL);
    url.search = new URLSearchParams({
      q: `${city.trim()},${country}`,
      appid: OPENWEATHER_API_KEY,
      units: "metric",
      lang: "pt_br"
    }).toString();

    const response = await fetch(url);
    let data;
    try { data = await response.json(); } catch { data = {}; }

    if (response.status === 404) throw new Error("CITY_NOT_FOUND");
    if (response.status === 401) throw new Error("INVALID_KEY");
    if (!response.ok) throw new Error("API_ERROR");
    if (!data.main || typeof data.main.temp !== "number") throw new Error("INVALID_DATA");

    displayWeather(data, country);
    publishWeather(data, country);
    showMessage(`Clima de ${data.name} atualizado com sucesso.`, "success");
  } catch (error) {
    console.error("Falha ao consultar OpenWeatherMap:", error);
    if (error.name === "TypeError") {
      showMessage("Não foi possível consultar os dados. Verifique sua conexão com a internet.", "error");
    } else if (error.message === "CITY_NOT_FOUND") {
      showMessage("Cidade não encontrada. Verifique o nome informado e tente novamente.", "error");
    } else if (error.message === "INVALID_KEY") {
      showMessage("Não foi possível acessar o serviço meteorológico. Verifique a configuração da API Key.", "error");
    } else {
      showMessage("Ocorreu um problema ao consultar o clima. Tente novamente em instantes.", "error");
    }
  } finally {
    setLoading(false);
  }
}

function publishMqtt(topic, payload) {
  if (!mqttClient?.connected) return;
  mqttClient.publish(topic, String(payload), { qos: 0, retain: true }, error => {
    if (error) console.error(`Falha ao publicar em ${topic}:`, error);
  });
}

function publishWeather(data, country) {
  publishMqtt(TOPICS.temperature, data.main.temp.toString());
  publishMqtt(TOPICS.humidity, data.main.humidity.toString());
  publishMqtt(TOPICS.currentCity, `${data.name}, ${country}`);
  elements.mqttLastMessage.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initializeMqtt() {
  try {
    mqttClient = mqtt.connect(MQTT_BROKER, {
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true
    });
    mqttClient.on("connect", () => {
      elements.mqttBadge.classList.remove("disconnected");
      elements.mqttBadge.classList.add("connected");
      elements.mqttStatus.textContent = "Conectado";
      mqttClient.subscribe([TOPICS.temperature, TOPICS.humidity, TOPICS.currentCity, TOPICS.requestedCity], error => {
        if (error) console.error("Falha ao assinar tópicos MQTT:", error);
      });
    });
    mqttClient.on("reconnect", () => {
      elements.mqttStatus.textContent = "Reconectando";
    });
    mqttClient.on("offline", () => setMqttDisconnected("Offline"));
    mqttClient.on("close", () => setMqttDisconnected("Desconectado"));
    mqttClient.on("error", error => {
      console.error("Erro MQTT:", error);
      setMqttDisconnected("Erro na conexão");
    });
    mqttClient.on("message", (topic, message) => {
      elements.mqttLastMessage.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const value = message.toString();
      // Os dados recebidos são mostrados no painel, mas não são adicionados ao gráfico aqui.
      // Isso evita duplicar os pontos que já foram registrados pela consulta à API.
      if (topic === TOPICS.currentCity && !currentWeather) $("location").textContent = value;
      console.debug("Mensagem MQTT recebida:", topic, value);
    });
  } catch (error) {
    console.error("Não foi possível iniciar MQTT:", error);
    setMqttDisconnected("Indisponível");
  }
}

function setMqttDisconnected(label) {
  elements.mqttBadge.classList.remove("connected");
  elements.mqttBadge.classList.add("disconnected");
  elements.mqttStatus.textContent = label;
}

function addToHistory(weather) {
  const entry = {
    city: weather.city,
    country: weather.country,
    temperature: Math.round(weather.temperature),
    humidity: weather.humidity,
    date: new Date().toISOString()
  };
  historyItems = [entry, ...historyItems.filter(item => item.city !== entry.city || item.country !== entry.country)].slice(0, 6);
  renderHistory();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (historyItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "As cidades consultadas aparecerão aqui.";
    elements.historyList.appendChild(empty);
    return;
  }
  historyItems.forEach(item => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "history-item";
    card.setAttribute("aria-label", `Consultar novamente ${item.city}, temperatura ${item.temperature} graus e umidade ${item.humidity} por cento`);
    const details = document.createElement("span");
    details.innerHTML = "";
    const name = document.createElement("strong");
    name.textContent = `${item.city}, ${item.country}`;
    const humidity = document.createElement("span");
    humidity.textContent = `Umidade: ${item.humidity}%`;
    details.append(name, humidity);
    const temperature = document.createElement("span");
    temperature.className = "history-temp";
    temperature.textContent = `${item.temperature} `;
    const unit = document.createElement("small");
    unit.textContent = "°C";
    temperature.appendChild(unit);
    card.append(details, temperature);
    card.addEventListener("click", () => {
      elements.city.value = item.city;
      elements.country.value = item.country;
      fetchWeather(item.city, item.country);
    });
    elements.historyList.appendChild(card);
  });
}

function saveFavorite() {
  if (!currentSearch) return;
  localStorage.setItem("climaview-favorite", JSON.stringify(currentSearch));
  renderFavorite();
  showMessage(`${currentSearch.city} foi salva como cidade favorita.`, "success");
}

function renderFavorite() {
  try {
    const favorite = JSON.parse(localStorage.getItem("climaview-favorite") || "null");
    const hasFavorite = favorite && favorite.city && favorite.country;
    elements.favoriteCity.textContent = hasFavorite ? `${favorite.city}, ${favorite.country}` : "Nenhuma cidade salva";
    elements.loadFavoriteButton.disabled = !hasFavorite;
  } catch {
    elements.favoriteCity.textContent = "Nenhuma cidade salva";
    elements.loadFavoriteButton.disabled = true;
  }
}

function loadFavorite() {
  try {
    const favorite = JSON.parse(localStorage.getItem("climaview-favorite") || "null");
    if (!favorite?.city || !favorite?.country) return;
    elements.city.value = favorite.city;
    elements.country.value = favorite.country;
    fetchWeather(favorite.city, favorite.country);
  } catch {
    showMessage("Não foi possível carregar a cidade favorita salva.", "error");
  }
}

function setTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  elements.themeToggle.textContent = isDark ? "☀" : "☾";
  elements.themeToggle.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
  localStorage.setItem("climaview-theme", isDark ? "dark" : "light");
  if (weatherChart) {
    const color = isDark ? "#a4b2ca" : "#74809a";
    weatherChart.options.scales.x.ticks = { color };
    weatherChart.options.scales.temperature.ticks = { color };
    weatherChart.options.scales.humidity.ticks = { color };
    weatherChart.options.scales.x.title.color = color;
    weatherChart.options.scales.temperature.title.color = color;
    weatherChart.options.scales.humidity.title.color = color;
    weatherChart.options.plugins.legend.labels.color = isDark ? "#edf3ff" : "#17233f";
    weatherChart.update();
  }
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  const city = elements.city.value.trim();
  const country = elements.country.value;
  if (!city) {
    showMessage("Informe uma cidade antes de realizar a consulta.", "error");
    elements.city.focus();
    return;
  }
  publishMqtt(TOPICS.requestedCity, `${city},${country}`);
  fetchWeather(city, country);
});

elements.favoriteButton.addEventListener("click", saveFavorite);
elements.loadFavoriteButton.addEventListener("click", loadFavorite);
elements.clearHistoryButton.addEventListener("click", () => {
  historyItems = [];
  renderHistory();
});
elements.themeToggle.addEventListener("click", () => setTheme(!document.body.classList.contains("dark")));

initializeChart();
initializeMqtt();
renderFavorite();
renderHistory();
setTheme(localStorage.getItem("climaview-theme") === "dark");
