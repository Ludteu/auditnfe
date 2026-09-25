/**
 * Validação real de CNPJ (dígito verificador) — sem isso, campos como o
 * CNPJ da empresa aceitavam qualquer sequência de 14 números (inclusive as
 * geradas automaticamente na tela de cadastro rápido), e só se descobria
 * que o CNPJ não existia quando a SEFAZ rejeitava com "CNPJ informado
 * inválido (DV ou zeros)" — tarde demais, na hora de buscar notas.
 */
const limparCnpj = (cnpj) => String(cnpj || '').replace(/\D/g, '');

const validarCnpj = (cnpj) => {
  const limpo = limparCnpj(cnpj);
  if (limpo.length !== 14) return false;
  if (/^(\d)\1+$/.test(limpo)) return false; // todos os dígitos iguais (ex: zeros)

  const calcularDigito = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, digito, i) => acc + parseInt(digito, 10) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base = limpo.substring(0, 12);
  const dv1 = calcularDigito(base);
  const dv2 = calcularDigito(base + dv1);
  return limpo === base + dv1 + dv2;
};

module.exports = { validarCnpj, limparCnpj };
