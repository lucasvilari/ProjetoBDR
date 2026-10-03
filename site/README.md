# Site das perguntas

Ainda não construído. Esta pasta vai guardar o site do projeto, que responde às dez
perguntas sem se organizar por elas: cada resposta aparece dentro
de uma tela sobre um município, um político, um partido ou o custo das cadeiras.

## Telas previstas

- **Página inicial:** mapa dos seis estados (AP, MG, MS, PB, RO e RR),
  colorido pelo índice ideológico, com busca única.
- **Ficha do município:** indicadores, partidos mais votados, sucessão de prefeitos e
  comparação entre eleitorado e eleitos.
- **Ficha do político:** carreira em linha do tempo, trajetória ideológica,
  financiamento e destino do gasto de campanha.
- **Ficha do partido:** posição segundo os especialistas, as coligações e as
  votações da Câmara,
  onde é forte e perfil dos municípios que governa.
- **O mercado das cadeiras:** custo por cargo e fatores associados à eleição.
- **Bastidores:** fontes, modelo de dados, consultas e limitações conhecidas.

Todo gráfico terá a gaveta "ver consulta", que mostra o SQL que rodou, com os
parâmetros, o tempo e o número de linhas.

## Dados

O site lê o banco `eleicoes`, montado a partir do dump (ver o README da raiz). Não
precisa do crawler nem dos CSVs. As telas consultam visões materializadas,
recalculadas uma vez depois de cada carga, e não as tabelas de
votação diretamente.
