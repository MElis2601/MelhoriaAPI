# ClimaView — Dashboard Meteorológico

Dashboard meteorológico desenvolvido com HTML, CSS e JavaScript, utilizando a API OpenWeatherMap para consultar dados do clima e MQTT para comunicação com o projeto ESP32.

## Tecnologias utilizadas

- HTML5 e CSS3
- JavaScript (Fetch API, localStorage)
- OpenWeatherMap Current Weather API
- MQTT via WebSocket com broker HiveMQ
- Chart.js

## Como executar

1. Baixe ou clone os arquivos do projeto.
2. Abra `script.js` e substitua `COLOQUE_SUA_API_KEY_AQUI` pela sua chave da OpenWeatherMap.
3. Salve o arquivo.
4. Abra `index.html` em um navegador. Se o navegador bloquear algum recurso ao abrir diretamente, execute o projeto com a extensão Live Server do Visual Studio Code.
5. Tenha conexão com a internet para carregar as bibliotecas e consultar a API.

## Configuração da API Key

No início do arquivo `script.js`, localize:

```js
const OPENWEATHER_API_KEY = "COLOQUE_SUA_API_KEY_AQUI";
```

Substitua o texto pela sua chave. Não publique uma chave real em repositórios públicos nem em capturas de tela. Para um projeto público, o ideal é fazer as requisições por um backend que mantenha a chave protegida.

## Como funciona o MQTT

O dashboard conecta-se ao broker público HiveMQ por WebSocket seguro (`wss://broker.hivemq.com:8884/mqtt`) e utiliza estes tópicos:

- `esp32/clima/temperatura`
- `esp32/clima/umidade`
- `esp32/clima/cidadeAtual`
- `esp32/clima/cidade`

Quando uma consulta é concluída, o dashboard publica a temperatura, a umidade e a cidade atual. Ao enviar uma nova cidade, também publica o nome e o país no tópico de solicitação para que o ESP32 possa receber a mensagem, desde que esteja inscrito no mesmo tópico. O status da conexão é mostrado na tela.

**Atenção:** o broker HiveMQ público não é privado. Para um uso real, escolha tópicos exclusivos e implemente autenticação e controle de acesso. Confirme também se o firmware do ESP32 usa os mesmos tópicos.

## Funcionalidades

- Consulta meteorológica por cidade e país.
- Cards para temperatura, umidade, sensação térmica, temperaturas mínima e máxima, vento, direção do vento, pressão, condição climática e horários do nascer e pôr do sol.
- Gráfico de temperatura e umidade das últimas 12 consultas.
- Data e horário da última atualização.
- Mensagens de erro e indicador de carregamento.
- Histórico de até seis cidades consultadas na sessão atual.
- Cidade favorita salva com `localStorage`.
- Alternância entre tema claro e escuro, com preferência salva.
- Layout responsivo para computador, tablet e celular.
- Melhorias de acessibilidade: rótulos de campos, mensagens com `aria-live`, navegação por teclado, foco visível e descrição acessível do gráfico.
- Tema visual ajustado conforme a condição climática.

## Observações importantes

- O histórico de consultas existe apenas enquanto a página estiver aberta; a cidade favorita e o tema ficam salvos no navegador.
- O gráfico usa os dados reais retornados pela API a cada consulta.
- O broker público pode receber mensagens de outros usuários. Não envie dados pessoais pelos tópicos.
- A chave da API fica visível no JavaScript do navegador. Para demonstrações escolares, use uma chave de teste e restrinja-a quando possível; em produção, mantenha a chave no servidor.
