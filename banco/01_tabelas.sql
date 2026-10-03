-- =============================================================================
-- Redução do D.E.R. a tabelas: esquema relacional do projeto
-- PostgreSQL 16
--
-- Os pontos em que os dados reais do TSE obrigaram a uma decisão própria estão
-- marcados com "AJUSTE" e explicados em banco/README.md.
-- Índices, visões e a função de apoio ficam em 02_indices_visoes.sql, criados
-- depois da carga para não pesar nas inserções.
-- =============================================================================

-- ------------------------------------------------------------------ núcleo eleitoral

CREATE TABLE eleicao (
    cod_eleicao   INTEGER      PRIMARY KEY,
    ano           SMALLINT     NOT NULL,
    abrangencia   VARCHAR(10)  NOT NULL CHECK (abrangencia IN ('MUNICIPAL', 'GERAL'))
);

CREATE TABLE vaga (
    cod_eleicao   INTEGER      NOT NULL REFERENCES eleicao (cod_eleicao),
    ue            VARCHAR(5)   NOT NULL,
    cargo         VARCHAR(40)  NOT NULL,
    qt_vagas      INTEGER      NOT NULL CHECK (qt_vagas > 0),
    PRIMARY KEY (cod_eleicao, ue, cargo)
);

CREATE TABLE politico (
    titulo_eleitoral  VARCHAR(12)  PRIMARY KEY,
    cpf               VARCHAR(11),
    nome              VARCHAR(120) NOT NULL,
    data_nasc         DATE,
    genero            VARCHAR(20)
);

-- espectro_camara: posição média do partido nas votações nominais da Câmara dos
-- Deputados, de -100 (esquerda) a +100 (direita), do painel em banco/fontes/
-- espectro_camara.json; NULL para partido sem deputados nas votações analisadas.
CREATE TABLE partido (
    id_partido      INTEGER      PRIMARY KEY,
    numero          SMALLINT     NOT NULL,
    sigla           VARCHAR(20)  NOT NULL,
    nome            VARCHAR(120) NOT NULL,
    espectro_camara NUMERIC(4,1) CHECK (espectro_camara BETWEEN -100 AND 100),
    UNIQUE (numero, sigla)
);

CREATE TABLE ideologia_partido (
    id_partido    INTEGER      NOT NULL REFERENCES partido (id_partido),
    ano_survey    SMALLINT     NOT NULL,
    nota          NUMERIC(4,2) NOT NULL CHECK (nota BETWEEN 0 AND 10),
    PRIMARY KEY (id_partido, ano_survey)
);

-- Posição de cada partido revelada pelas coligações para prefeito,
-- na mesma escala de 0 (esquerda) a 10 (direita) do survey. Calculada pela carga
-- (etapa ideologia_coligacao) a partir de candidatura.coligacao, sem fonte nova.
CREATE TABLE ideologia_coligacao (
    id_partido    INTEGER      NOT NULL REFERENCES partido (id_partido),
    ano           SMALLINT     NOT NULL,
    nota          NUMERIC(4,2) NOT NULL CHECK (nota BETWEEN 0 AND 10),
    coligacoes    INTEGER      NOT NULL CHECK (coligacoes > 0),
    PRIMARY KEY (id_partido, ano)
);

-- AJUSTE 1: antes de 2018 o SQ_CANDIDATO do TSE não identifica a candidatura
-- (2000-2008 repetem o valor dentro do próprio ano; 2010-2016 repetem entre
-- anos). Nessas eleições a carga grava um identificador sintético NEGATIVO,
-- que nunca colide com os sequenciais positivos do TSE. De 2018 a 2024
-- (escopo padrão, onde estão bens, receitas, despesas e votos) o valor é o
-- SQ_CANDIDATO original.
-- AJUSTE 2: situacao_final passa de VARCHAR(30) para VARCHAR(50), porque o TSE
-- publica situações como "RENÚNCIA/FALECIMENTO/CASSAÇÃO ANTES DA ELEIÇÃO".
CREATE TABLE candidatura (
    sq_candidato      BIGINT       PRIMARY KEY,
    titulo_eleitoral  VARCHAR(12)  NOT NULL REFERENCES politico (titulo_eleitoral),
    cod_eleicao       INTEGER      NOT NULL REFERENCES eleicao (cod_eleicao),
    id_partido        INTEGER      NOT NULL REFERENCES partido (id_partido),
    ue                VARCHAR(5)   NOT NULL,
    cargo             VARCHAR(40)  NOT NULL,
    coligacao         VARCHAR(250),
    escolaridade      VARCHAR(40),
    idade_posse       SMALLINT,
    reeleicao         BOOLEAN      NOT NULL DEFAULT FALSE,
    situacao_final    VARCHAR(50)
);

-- ------------------------------------------------------------------ patrimônio e finanças

CREATE TABLE bem (
    sq_candidato  BIGINT        NOT NULL REFERENCES candidatura (sq_candidato) ON DELETE CASCADE,
    nr_ordem      SMALLINT      NOT NULL,
    tipo          VARCHAR(120),
    descricao     TEXT,
    valor         NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (sq_candidato, nr_ordem)
);

CREATE TABLE receita (
    sq_receita    BIGINT        PRIMARY KEY,
    sq_candidato  BIGINT        NOT NULL REFERENCES candidatura (sq_candidato),
    fonte         VARCHAR(40),
    origem        VARCHAR(80),
    doador        VARCHAR(200),
    valor         NUMERIC(16,2) NOT NULL
);

CREATE TABLE despesa (
    sq_despesa    BIGINT        PRIMARY KEY,
    sq_candidato  BIGINT        NOT NULL REFERENCES candidatura (sq_candidato),
    tipo          VARCHAR(120),
    descricao     TEXT,
    fornecedor    VARCHAR(200),
    valor         NUMERIC(16,2) NOT NULL
);

-- ------------------------------------------------------------------ território e votação

CREATE TABLE municipio (
    cod_tse                VARCHAR(5)   PRIMARY KEY,
    cod_ibge               CHAR(7)      NOT NULL UNIQUE,
    nome                   VARCHAR(80)  NOT NULL,
    uf                     CHAR(2)      NOT NULL,
    regiao                 VARCHAR(20)  NOT NULL,
    idade_mediana          NUMERIC(4,1),
    indice_envelhecimento  NUMERIC(6,2)
);

CREATE TABLE idhm_municipio (
    cod_tse       VARCHAR(5)   NOT NULL REFERENCES municipio (cod_tse),
    ano           SMALLINT     NOT NULL,
    idhm          NUMERIC(4,3) NOT NULL,
    PRIMARY KEY (cod_tse, ano)
);

CREATE TABLE indicador_anual (
    cod_tse          VARCHAR(5)    NOT NULL REFERENCES municipio (cod_tse) ON DELETE CASCADE,
    ano              SMALLINT      NOT NULL,
    pib              NUMERIC(18,2),
    populacao        INTEGER,
    pib_per_capita   NUMERIC(14,2) GENERATED ALWAYS AS (pib / NULLIF(populacao, 0)) STORED,
    PRIMARY KEY (cod_tse, ano)
);

CREATE TABLE apuracao (
    cod_eleicao   INTEGER      NOT NULL REFERENCES eleicao (cod_eleicao),
    cod_tse       VARCHAR(5)   NOT NULL REFERENCES municipio (cod_tse),
    zona          SMALLINT     NOT NULL,
    turno         SMALLINT     NOT NULL CHECK (turno IN (1, 2)),
    cargo         VARCHAR(40)  NOT NULL,
    aptos         INTEGER      NOT NULL,
    abstencoes    INTEGER      NOT NULL,
    brancos       INTEGER      NOT NULL,
    nulos         INTEGER      NOT NULL,
    -- AJUSTE 3: válidos oficiais do TSE. aptos - abstenções - brancos - nulos inclui
    -- os votos anulados (candidatos com registro indeferido), que não são válidos.
    validos       INTEGER      NOT NULL,
    isentos       INTEGER      GENERATED ALWAYS AS (brancos + nulos + abstencoes) STORED,
    PRIMARY KEY (cod_eleicao, cod_tse, zona, turno, cargo)
);

CREATE TABLE perfil_comparecimento (
    cod_eleicao     INTEGER      NOT NULL REFERENCES eleicao (cod_eleicao),
    cod_tse         VARCHAR(5)   NOT NULL REFERENCES municipio (cod_tse),
    zona            SMALLINT     NOT NULL,
    turno           SMALLINT     NOT NULL,
    faixa_etaria    VARCHAR(30)  NOT NULL,
    escolaridade    VARCHAR(40)  NOT NULL,
    aptos           INTEGER      NOT NULL,
    comparecimento  INTEGER      NOT NULL,
    PRIMARY KEY (cod_eleicao, cod_tse, zona, turno, faixa_etaria, escolaridade)
);

CREATE TABLE votos_cand (
    sq_candidato  BIGINT       NOT NULL REFERENCES candidatura (sq_candidato),
    cod_tse       VARCHAR(5)   NOT NULL REFERENCES municipio (cod_tse),
    zona          SMALLINT     NOT NULL,
    turno         SMALLINT     NOT NULL,
    votos         INTEGER      NOT NULL CHECK (votos >= 0),
    PRIMARY KEY (sq_candidato, cod_tse, zona, turno)
);

CREATE TABLE votos_part (
    cod_eleicao     INTEGER      NOT NULL REFERENCES eleicao (cod_eleicao),
    id_partido      INTEGER      NOT NULL REFERENCES partido (id_partido),
    cod_tse         VARCHAR(5)   NOT NULL REFERENCES municipio (cod_tse),
    zona            SMALLINT     NOT NULL,
    turno           SMALLINT     NOT NULL,
    cargo           VARCHAR(40)  NOT NULL,
    votos_nominais  INTEGER      NOT NULL DEFAULT 0,
    votos_legenda   INTEGER      NOT NULL DEFAULT 0,
    PRIMARY KEY (cod_eleicao, id_partido, cod_tse, zona, turno, cargo)
);
