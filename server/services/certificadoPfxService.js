const fs = require('fs');
const forge = require('node-forge');

/**
 * Abre o .pfx/.p12 com a senha informada. Centraliza os dois cuidados que
 * fazem certificado real da ICP-Brasil funcionar aqui:
 * - strict:false — o validador ASN.1 em modo estrito do forge rejeita a
 *   estrutura de muitos certificados reais (cadeia de intermediárias,
 *   atributos extras nos bags) mesmo com a senha certa.
 * - Erros de senha errada (falha de MAC) são diferenciados de qualquer
 *   outro erro real de leitura, que aparece com a mensagem técnica
 *   original em vez de mascarada como "senha incorreta".
 */
const abrirPfx = (caminhoArquivo, senha) => {
  let p12Asn1;
  try {
    const bytes = fs.readFileSync(caminhoArquivo).toString('binary');
    p12Asn1 = forge.asn1.fromDer(bytes);
  } catch (error) {
    throw new Error('Arquivo de certificado inválido ou corrompido.');
  }

  try {
    return forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
  } catch (error) {
    if (/mac could not be verified|invalid password/i.test(error.message)) {
      throw new Error('Senha do certificado incorreta.');
    }
    throw new Error(`Não foi possível ler o certificado: ${error.message}`);
  }
};

/**
 * Lê os metadados do certificado (validade, titular) — usado no upload pra
 * validar a senha e preencher a validade sem pedir a data à mão.
 */
const lerCertificadoPfx = (caminhoArquivo, senha) => {
  const p12 = abrirPfx(caminhoArquivo, senha);

  const bagsCertificado = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bag = (bagsCertificado[forge.pki.oids.certBag] || [])[0];
  if (!bag || !bag.cert) {
    throw new Error('Não foi possível encontrar um certificado dentro do arquivo.');
  }

  const titular = bag.cert.subject.getField('CN')?.value || null;
  // Certificado e-CNPJ da ICP-Brasil traz o CN no formato "RAZÃO SOCIAL:CNPJ"
  // — é daqui que confirmamos que o arquivo enviado é mesmo da empresa
  // cadastrada, sem depender do usuário digitar/conferir isso à mão.
  const cnpjCertificado = titular?.match(/(\d{14})/)?.[1] || null;

  return {
    validoDesde: bag.cert.validity.notBefore,
    validoAte: bag.cert.validity.notAfter,
    titular,
    cnpjCertificado
  };
};

/**
 * Extrai a chave privada e o(s) certificado(s) do .pfx já em PEM, pra usar
 * em https.Agent({ cert, key }) em vez de https.Agent({ pfx, passphrase }).
 * O motivo: a partir do OpenSSL 3.x (Node 17+), o parser nativo de PKCS#12
 * do Node passa a rejeitar arquivos que usam RC2-40-CBC — exatamente a
 * cifra que a maioria dos certificados A1 da ICP-Brasil usa — com o erro
 * genérico "Unsupported PKCS12 PFX data", mesmo com a senha certa e o
 * arquivo íntegro (o node-forge, sendo puro JS, não depende dos provedores
 * do OpenSSL do sistema e não tem essa limitação). Decodificando aqui e
 * entregando PEM pronto, o TLS do Node nunca precisa entender o PKCS#12.
 *
 * `certPem` inclui a cadeia inteira do .pfx (folha + intermediárias, nessa
 * ordem) num só PEM — é assim que se manda uma cadeia de certificado num
 * handshake TLS. Essa cadeia é só pra identificar ESTE lado (autenticação
 * mútua); não tem nada a ver com validar o certificado do servidor da
 * SEFAZ, que usa sua própria CA (pública, já confiável por padrão) — por
 * isso essa função não devolve nem define `ca` nenhum. Passar a cadeia do
 * próprio certificado como `ca` do https.Agent SUBSTITUI a lista de raízes
 * confiáveis padrão do Node em vez de completá-la, e foi exatamente isso
 * que causou o "unable to get local issuer certificate" ao tentar validar
 * o servidor da SEFAZ.
 */
const extrairPemDoPfx = (caminhoArquivo, senha) => {
  const p12 = abrirPfx(caminhoArquivo, senha);

  const bagsChave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bagsChaveSimples = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const bagChave = (bagsChave[forge.pki.oids.pkcs8ShroudedKeyBag] || bagsChaveSimples[forge.pki.oids.keyBag] || [])[0];
  if (!bagChave || !bagChave.key) {
    throw new Error('Não foi possível encontrar a chave privada dentro do certificado.');
  }

  const bagsCertificado = p12.getBags({ bagType: forge.pki.oids.certBag });
  const listaCertificados = bagsCertificado[forge.pki.oids.certBag] || [];
  if (listaCertificados.length === 0) {
    throw new Error('Não foi possível encontrar um certificado dentro do arquivo.');
  }

  return {
    keyPem: forge.pki.privateKeyToPem(bagChave.key),
    certPem: listaCertificados.map((bag) => forge.pki.certificateToPem(bag.cert)).join('\n')
  };
};

module.exports = { lerCertificadoPfx, extrairPemDoPfx };
