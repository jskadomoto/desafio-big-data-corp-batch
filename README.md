# Desafio Big Data Corp: JSONL de clubes para CSV

Programa de linha de comando que lê um arquivo JSONL onde cada linha é um clube de futebol com sua lista de jogadores, e grava dois CSVs:

- `clubs.csv`, um registro por clube
- `players.csv`, um registro por jogador, carregando o `club_id` do clube a que ele pertence

Só entram clubes de Série A ou Série B. O arquivo de entrada pode vir sujo: linha que não é JSON válido, registro sem identificador, data impossível, campo faltando, jogador que não é objeto. Nada disso derruba o processamento. O programa descarta o que precisa descartar, conta cada ocorrência por motivo e segue até o fim do arquivo.

Se a execução for interrompida no meio, por Ctrl-C, por queda da máquina ou por um `kill -9`, rodar o mesmo comando de novo retoma de onde parou, sem duplicar nem perder linha.

## Requisitos

Node 20 ou superior. Nenhuma dependência de runtime. O CI verifica as três versões.

## Como rodar

```bash
npm install
npm run build
```

Para gerar os CSVs na pasta output que está vazia, a partir do `data/sample_clubes.jsonl`:

```bash
npm run generate
```

Para gerar amostra com 1 milhão de registros e consumi-los, rode:

```bash
npm run generate:sample
npm run sample
```


## Retomada depois de uma queda

Não existe comando de retomada: é o mesmo comando. A cada 100 mil linhas o programa grava um ponto de retomada no diretório de saída, com até onde a entrada foi lida, quantos bytes de cada CSV já estão efetivados no disco e os contadores acumulados.

```bash
node dist/cli/index.js base.jsonl ./saida     # o processo morre na metade
node dist/cli/index.js base.jsonl ./saida     # continua de onde parou
```

Enquanto o trabalho não termina, o diretório de saída tem `clubs.csv.tmp`, `players.csv.tmp` e `.desafio-batch-checkpoint.json`. Os nomes definitivos só aparecem no fim, então nunca existe um `clubs.csv` pela metade. Quando termina bem, o ponto de retomada e os temporários somem.

A garantia é de exatamente uma vez, não de pelo menos uma vez: o ponto guarda o tamanho em bytes de cada CSV, e a retomada trunca os parciais nesse tamanho antes de continuar, então nada vira linha duplicada. Se a entrada tiver mudado desde o ponto, ele é descartado e o processamento recomeça do zero. Para forçar um recomeço, apague o `.desafio-batch-checkpoint.json`.

O intervalo entre pontos é ajustável pela variável `DESAFIO_BATCH_CHECKPOINT_INTERVAL`, em linhas:

```bash
DESAFIO_BATCH_CHECKPOINT_INTERVAL=20000 node dist/cli/index.js base.jsonl ./output
```

É o botão que troca custo por trabalho perdido: mais pontos custam mais `fsync`, menos pontos significam reprocessar mais linhas depois de uma queda. Um valor que não seja inteiro positivo derruba a execução com código 1, em vez de cair no padrão em silêncio.


## Saídas

`clubs.csv` tem as colunas, nesta ordem:

`Id do Clube, Nome, Campeonato, Data de Fundação, Cidade, Estado, País, Estádio, Presidente, Apelido, Cores`

`players.csv` tem:

`Id do Clube, Id do Jogador, Nome, Idade, Gols, Data de Estreia, Posição, Número da Camisa`

Os dois são UTF-8, separados por vírgula, com o cabeçalho na primeira linha. Campos que contêm vírgula, aspas ou quebra de linha saem entre aspas duplas, com as aspas internas duplicadas, como manda o RFC 4180. A saída é determinística: a mesma entrada sempre produz os mesmos bytes, com ou sem interrupção no meio.

Os arquivos [output/clubs.csv](output/clubs.csv) e [output/players.csv](output/players.csv) são a saída de verdade do programa rodando sobre o [data/sample_clubes.jsonl](data/sample_clubes.jsonl). Rodar `npm run generate` reproduz os dois byte a byte.

No fim da execução sai um relatório no stderr (não no stdout, para não atrapalhar quem redirecionar a saída). Rodando sobre o sample:

```
resumo do processamento
  linhas lidas:                        6
  linhas em branco:                    0
  linhas acima do limite:              0
  json inválido:                       0
  registros inválidos (não é objeto):  0
  registros inválidos (sem club_id):   0
  listas de jogadores malformadas:     0
  jogadores inválidos:                 0
  clubes filtrados (fora de A e B):    1
  clubes escritos:                     5
  jogadores escritos:                  8
  duração:                             7 ms (857 linhas/s)
```

O clube filtrado é o Nacional, que está com campeonato "SEM CAMPEONATO". O Santos entra normalmente mesmo com o `nickname` em `null`: o campo sai vazio e o resto da linha é preservado. O presidente do Cruzeiro tem vírgula no nome e sai entre aspas. A fixture usada nos testes é mais suja de propósito e exercita todos os contadores acima.

Em arquivo grande, o progresso aparece a cada 100 mil linhas lidas, também no stderr.

## Códigos de saída

| Código | Significado                                                              |
| ------ | ------------------------------------------------------------------------ |
| 0      | terminou bem                                                             |
| 1      | uso incorreto: faltou o arquivo de entrada, ou a configuração é inválida |
| 2      | falha de I/O, como arquivo inexistente ou erro de escrita                |
| 130    | interrompido com Ctrl-C (SIGINT), progresso salvo                        |
| 143    | interrompido com SIGTERM, progresso salvo                                |

Nos dois casos de interrupção o programa termina o registro que estava processando, grava o ponto de retomada e só então sai, então basta repetir o comando para continuar.

## Escala

Números medidos numa amostra de 1 milhão de registros com sujeira realista (672 MB de entrada, 159 MB de saída), gerada por `npm run generate:sample`:

| medida                       | valor             |
| ---------------------------- | ----------------- |
| tempo total                  | 8,7 s             |
| throughput                   | ~115 mil linhas/s |
| pico de memória              | 240 MB, constante |
| custo dos pontos de retomada | ~3% do tempo      |

Onde o tempo vai nesse arquivo: 7% lendo do disco, 3% recortando linhas, 35% no `JSON.parse` e o resto montando e escrevendo as linhas. O disco não é o gargalo; o trabalho é de CPU e alocação.

A memória não acompanha o tamanho do arquivo, porque nada é acumulado: cada linha entra, vira zero ou mais linhas de saída e é esquecida. Não há mapa, ordenação nem deduplicação em lugar nenhum. O limite prático não é o tamanho do arquivo, é o tamanho da maior linha.

## Qualidade

```bash
npm run typecheck    # tipos
npm run format       # aplica o Prettier (format:check só confere)
npm run lint         # ESLint (lint:fix corrige o que der)
npm test
npm run coverage     # Roda os testes e mostra a cobertura do projeto
```

O Prettier decide como o código se parece e o ESLint decide o que ele pode fazer. Os dois não brigam pelo mesmo arquivo porque o `eslint-config-prettier` entra por último na configuração e desliga toda regra de estilo do ESLint. As regras que dependem de tipo estão ligadas (`recommendedTypeChecked`), que é o que pega promise ignorada e `any` escapando.

O CI roda tudo isso em Node 20, 22 e 24 a cada push, e ainda reexecuta o programa sobre o `data/sample_clubes.jsonl` para falhar se os CSVs em `output/` divergirem do que o código gera. É o que faz a cobertura ser garantida em vez de lembrada.

A cobertura está travada em 100% de linhas, branches, funções e statements. Se cair de 100, o comando falha. A única exclusão é `src/cli/index.ts`, que é o bootstrap do processo e tem três linhas; ele é exercitado de verdade pelos testes end to end, que sobem o CLI num processo separado.

Cobertura de 100% prova que toda linha executou. Para saber se algum teste falharia caso a linha mudasse, existe o `npm run mutants`: ele injeta 36 defeitos plausíveis no código, um de cada vez, roda a suíte e falha se algum passar despercebido. O CI roda isso a cada push.

## Estrutura

```
src/
  domain/           regras puras, sem I/O e sem dependência
    result.ts       resultado sem exception, para erro de dado
    field.ts        formatação de campo escalar e da lista de cores
    championship.ts normalização e filtro de campeonato
    iso-date.ts     validação de data yyyy-MM-dd
    club.ts         invariantes do clube
    player.ts       invariantes do jogador
    transform.ts    cabeçalhos e montagem das linhas
  application/
    ports.ts              contratos que o caso de uso enxerga
    process-clubs-file.ts o pipeline linha a linha
  infrastructure/
    jsonl-file-source.ts  leitura em blocos, com offset em bytes
    csv-file-writer.ts    escrita CSV em lote, com fsync e temporário
    checkpoint-store.ts   ponto de retomada, gravado de forma atômica
  cli/
    app-error.ts    erro operacional com código de saída
    main.ts         montagem do pipeline, sinais, retomada, relatório
    index.ts        bootstrap
tests/
  unit/ integration/ e2e/ fixtures/
data/
  /sample
    sample.jsonl  # Gerado a partir do script: npm run generate:sample
  sample_clubes.jsonl  a entrada de exemplo do enunciado
output/
  /sample 
    clubs.csv  # Gerado a partir do script: npm run sample
    players.csv  # Gerado a partir do script: npm run sample
  clubs.csv         a saída do programa sobre o sample, versionada
  players.csv
```

Cada camada só enxerga as de dentro: o domínio não importa nada de `node:`, e o caso de uso conhece só a interface `TabularWriter` e um `AsyncIterable<SourceLine>`, então dá para testá-lo inteiro com dublês, sem tocar em disco. Ele também não sabe o que é um sinal nem o que é um arquivo de checkpoint: recebe um `shouldStop` para consultar e um `onCheckpoint` para chamar, e quem liga isso em sinal e em disco é o `main.ts`. A regra de dependência não é honra, é testada.

## Decisões

**Filtro de campeonato com normalização.** A base real escreve o mesmo campeonato de várias formas. Antes de comparar, o valor perde acento, perde espaço nas pontas, tem os espaços internos colapsados e sobe para maiúsculas. Assim "Série A", "serie a" e "SERIE B" passam, e "SERIE C" ou "Libertadores" não. Clube reprovado não gera linha em nenhum dos dois arquivos, nem os jogadores dele, e é contado como filtrado, não como inválido.

**Datas são convertidas, não rejeitadas.** O enunciado pede que toda data de saída esteja em `yyyy-MM-dd` e que só vire campo vazio o valor que não for uma data válida. Um timestamp ISO é uma data válida, o que ele não é é canônico. Então `2024-01-18T00:00:00Z`, `2024-1-5` e `18/01/2024` viram `2024-01-18`, `2024-01-05` e `2024-01-18`. O formato com barras é lido como convenção brasileira, dia antes do mês, porque a base é de futebol brasileiro. Data que não existe no calendário vira campo vazio: `2024-02-29` vale porque 2024 é bissexto, `2023-02-29` e `2024-02-30` não. Depois da data só pode vir hora, e a hora não precisa fazer sentido no relógio, mas precisa ter forma de hora: `2024-01-18 07:30` vale, `2024-01-18 a confirmar` não. Aceitar qualquer sufixo faria comentário de planilha virar data limpa, e dado inventado que parece bom é pior do que campo vazio. Número não é convertido de propósito, porque um epoch pode estar em segundos ou em milissegundos e escolher seria chute. A linha permanece no arquivo em qualquer caso: perder o clube inteiro por causa de uma data seria pior do que perder a data.

**Valores saem fiéis à origem.** O CSV não faz trim nem corrige grafia. Se o JSON traz `"  serie   b "`, é isso que aparece na coluna Campeonato. A normalização existe só para decidir o filtro, não para reescrever o dado. Quem for consumir o CSV recebe o que estava na fonte.

**Registro inválido é diferente de campo vazio.** A linha inteira só é descartada quando falta o que sustenta o registro: não é JSON válido, não é um objeto, ou não tem `club_id` (que é a chave que liga jogador a clube). Qualquer outro campo ruim ou ausente vira campo vazio e a linha permanece. Jogador que não é objeto é descartado sozinho, sem levar junto o clube nem os outros jogadores da lista.

**Uma parte ruim não derruba a parte boa.** A linha inteira só é descartada quando falta o que sustenta o registro. Se `players` vier com tipo errado, tipo a string `"nenhum"`, os dados próprios do clube continuam intactos: ele entra em `clubs.csv`, não gera jogador nenhum, e a lista perdida é contada em separado. Descartar o clube por causa da lista seria jogar fora informação boa junto com a ruim, que é o oposto de cuidar de dado imperfeito. Já `players` ausente ou nulo não é malformação nenhuma: é um clube sem jogadores.

**Terminador de linha `\n`.** Todas as linhas do CSV, inclusive a última, terminam em `\n`, e não em CRLF. O RFC 4180 fala em CRLF, mas o alvo aqui é pipeline de dados em Linux, onde `\n` é o que as ferramentas esperam. A escolha está isolada no writer: mudar é trocar uma constante.

**Sem framework HTTP.** O enunciado fala em baixa latência, mas aqui não existe requisição para responder: é um job em lote lendo arquivo e escrevendo arquivo. O que importa é throughput, e isso se resolve com streaming e backpressure, não com servidor. Botar Express ou Fastify no meio só somaria dependência e uma camada que ninguém chama.

**Sem `worker_threads`.** Medindo o pipeline por etapa, o `JSON.parse` responde por cerca de 35% do tempo e o disco por menos de 10%. Distribuir o parse entre workers, portanto, tem teto baixo para o custo que traz: seria preciso enviar blocos alinhados em quebra de linha, devolver texto já formatado e reordenar na escrita para a saída continuar determinística. E há um caminho mais simples antes desse: como nenhum registro depende de outro, dá para partir o arquivo, rodar N processos e concatenar as partes, sem código novo nenhum e escalando além de uma máquina.

**Escrita atômica com parcial recuperável.** Cada CSV é escrito em `<arquivo>.tmp` e só recebe o nome definitivo no fechamento com sucesso, então nunca existe um `clubs.csv` pela metade. O temporário, ao contrário do que uma escrita atômica costuma fazer, sobrevive a uma queda de propósito: é ele que o ponto de retomada aponta. Se a execução falhar sem ter chegado a gravar nenhum ponto, aí sim o parcial é apagado, porque não haveria o que aproveitar.

**A ordem da durabilidade.** Um ponto de retomada só é gravado depois de os bytes das saídas terem sido efetivados no disco com `fsync`, e o ponto em si é gravado em temporário, sincronizado e renomeado. Assim o ponto nunca promete mais do que o disco tem: uma queda no meio da gravação deixa o ponto anterior intacto, e o pior caso é reprocessar as linhas do último intervalo. Isso custa cerca de 3% do tempo total, medido, e é o preço de sobreviver a um `kill -9`.

**Escrita em lote, sem stream.** O writer acumula cerca de 1 MB e grava direto no descritor com posição explícita, em vez de mandar linha a linha para um `WriteStream`. São três ganhos de uma vez: a posição explícita é o que permite retomar truncando no ponto certo, o descritor é o que permite `fsync`, e escrever em lote troca uma chamada e uma promise por linha por uma a cada milhares de linhas. Medido isoladamente, o caminho de escrita cai de 6,6 s para 3,8 s em 6 milhões de linhas. A contrapressão vem de graça: o `await` do write só resolve quando o sistema aceitou os bytes, e a memória fica limitada ao lote.

**Teto de tamanho por linha.** O streaming protege contra arquivo grande, mas não contra registro grande: uma linha única precisa ser acumulada inteira antes de virar string, e o limite de string do V8 é 512 MB. Uma linha acima de 64 MB é descartada e contada em vez de derrubar o processo, para não perder junto o trabalho de todas as linhas boas. O offset continua avançando certo, então a retomada não pula nem repete nada.

**Erro de dado não é exception.** No domínio, o que pode dar errado com um dado devolve um `Result`, não lança. Em um arquivo de milhões de linhas, dado ruim é fluxo normal, e `try/catch` no caminho quente esconde o fluxo e custa caro. O único `try/catch` do caminho de dados envolve o `JSON.parse`, que não tem outra forma de sinalizar falha. Exception fica reservada para erro operacional, que é fatal mesmo.

**Exclusão do bootstrap na cobertura.** `src/cli/index.ts` só lê os argumentos, chama o `main` e devolve o código de saída. Não tem lógica para testar em isolamento, e forçar um teste unitário nele seria testar o Node. Ele é a única exclusão do relatório, marcada com comentário no próprio arquivo, e os testes end to end passam por ele de verdade ao subir o CLI num processo separado.

## Limitações conhecidas

**Não há trava contra duas execuções no mesmo diretório de saída.** Dois processos apontando para a mesma saída se corrompem em silêncio, cada um truncando o parcial do outro no ponto de retomada que ele mesmo gravou. Num agendamento que atrase e se sobreponha, isso acontece. A correção seria um arquivo de trava criado com `O_EXCL` no diretório de saída, fazendo a segunda instância sair com erro claro.

**A durabilidade contra queda de máquina é garantida por ordem de chamadas, não por teste de comportamento.** Os `fsync` e o rename atômico estão no lugar certo e há teste afirmando essa ordem, mas verificar de verdade exigiria perder o page cache, ou seja, corte de energia ou reset de máquina. Não dá para reproduzir isso num teste automatizado sem injetar uma camada falsa de sistema de arquivos.

**Uma linha maior que 64 MB é descartada.** É uma escolha, não um bug: a alternativa seria um parser incremental para consumir `players[]` como stream, o que daria memória constante por linha ao custo de bastante complexidade para um caso que no domínio de futebol não existe.
