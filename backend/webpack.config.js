const path = require('path');

module.exports = {
  entry: './src/index.js',  // Ruta relativa a 'webpack.config.js'
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')  // Ajusta la ruta de salida según sea necesario
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,  // Incluye .js y .jsx
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      },
      // Otras reglas de carga que necesites
    ]
  },
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify")  // Asegúrate de que esto esté correcto
    }
  }
};