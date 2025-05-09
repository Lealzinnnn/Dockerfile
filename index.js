const express = require('express');
const puppeteer = require('puppeteer');
const levenshtein = require('fast-levenshtein');

const app = express();
app.use(express.json());

app.post('/pesquisar', async (req, res) => {
  const { marca } = req.body;
  if (!marca) return res.status(400).json({ error: 'Informe a marca.' });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    await page.goto('https://busca.inpi.gov.br/MarcaPrincipal/', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#marcasForm\\:inputTextoBusca', { timeout: 10000 });

    await page.type('#marcasForm\\:inputTextoBusca', marca);
    await page.click('#marcasForm\\:btBuscar');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    let marcasEncontradas = [];
    let temMaisPaginas = true;

    while (temMaisPaginas) {
      const resultados = await page.$$eval('.rich-table-row', rows =>
        rows.map(row => row.querySelector('td:nth-child(3)')?.innerText.trim())
      );
      marcasEncontradas.push(...resultados.filter(Boolean));

      const nextButton = await page.$('a[title="Próxima Página"]');
      if (nextButton) {
        await Promise.all([
          nextButton.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
      } else {
        temMaisPaginas = false;
      }
    }

    await browser.close();

    let similares = 0;
    for (const nome of marcasEncontradas) {
      const dist = levenshtein.get(marca.toLowerCase(), nome.toLowerCase());
      const similarity = 1 - dist / Math.max(marca.length, nome.length);
      if (similarity >= 0.7) similares++;
    }

    const chance = marcasEncontradas.length
      ? 100 - (similares / marcasEncontradas.length) * 100
      : 100;

    res.json({
      marca,
      quantidadeEncontrada: marcasEncontradas.length,
      quantidadeSemelhante: similares,
      chanceAprovacao: parseFloat(chance.toFixed(2))
    });

  } catch (err) {
    await browser.close();
    res.status(500).json({ error: 'Erro ao pesquisar marca.', details: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
