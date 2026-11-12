export function emitToast(message: string) {
  window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message } }));
}

export async function copyText(value: string, label = "Conteúdo") {
  if (!value.trim()) {
    emitToast(`${label} ainda está vazio.`);
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    emitToast(`${label} copiado para a área de transferência.`);
    return true;
  } catch {
    emitToast(`Não foi possível copiar ${label.toLowerCase()}. Verifique a permissao do navegador.`);
    return false;
  }
}
