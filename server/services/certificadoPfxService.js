const fs = require('fs');
const forge = require('node-forge');

/**
 * Abre o .pfx/.p12 de verdade com a senha informada e lê a validade direto
 * do certificado X.509 — em vez de pedir pro usuário digitar a data à mão
 * (que era só um número solto, sem relação nenhuma com o arquivo real).
 * Também serve como validação: se a senha estiver errada, o forge falha ao
 * abrir o PKCS#12 e a gente sabe na hora, no upload, em vez de descobrir só
 * quando o buscador da SEFAZ falhar silenciosamente depois.
 */
const lerCertificadoPfx = (caminhoArquivo, senha) => {
  let p12Asn1;
  try {
    const bytes = fs.readFileSync(caminhoArquivo).toString('binary');
    p12Asn1 = forge.asn1.fromDer(bytes);
  } catch (error) {
    throw new Error('Arquivo de certificado inválido ou corrompido.');
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  } catch (error) {
    throw new Error('Senha do certificado incorreta, ou o arquivo não é um .pfx/.p12 válido.');
  }

  const bagsCertificado = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bag = (bagsCertificado[forge.pki.oids.certBag] || [])[0];
  if (!bag || !bag.cert) {
    throw new Error('Não foi possível encontrar um certificado dentro do arquivo.');
  }

  return {
    validoDesde: bag.cert.validity.notBefore,
    validoAte: bag.cert.validity.notAfter,
    titular: bag.cert.subject.getField('CN')?.value || null
  };
};

module.exports = { lerCertificadoPfx };
