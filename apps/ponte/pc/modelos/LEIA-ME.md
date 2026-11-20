# Modelos do Seguir

`yolox_nano.onnx` é o **YOLOX-Nano** da Megvii, em ONNX (entrada de 416 × 416).
A ponte usa só a classe "pessoa", para achar quem está no palco.

- **De onde veio:** release `0.1.1rc0` do repositório oficial,
  https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0
  (arquivo `yolox_nano.onnx`, 3.659.407 bytes).
- **SHA-256:** `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`
- **Licença:** Apache-2.0, Copyright (c) Megvii Inc. Texto completo em
  https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE.
  É compatível com a licença MIT deste projeto e pode ir junto com ele.

Ele vai junto com a atualização da ponte. Se o arquivo sumir desta pasta, o
Seguir usa o detector simples do OpenCV (erra mais) e a tela `/seguir` avisa.

Para trocar: baixe o arquivo do link acima, confira o SHA-256 e ponha aqui com o
mesmo nome.
