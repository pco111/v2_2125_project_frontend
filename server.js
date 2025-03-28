const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const app = express();
const port = 5992;

app.use(cors());
app.use(express.json());

app.post('/predict', (req, res) => {
  const userQuery = req.body.text;
  const model = req.body.model || 'CodeBERT-solidifi_uncomment';
  console.log(`Received query: "${userQuery}" with model: ${model}`);

  exec(`python3 bert_predict.py "${userQuery}" "${model}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${stderr}`);
      return res.status(500).json({ prediction: `Python error: ${stderr}` });
    }
    const prediction = stdout.trim();
    res.json({ prediction });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});