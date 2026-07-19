export function emitToast(message: string) {
  window.dispatchEvent(new CustomEvent("ramos:toast", { detail: { message } }));
}

export async function copyText(value: string, label = "Conteudo") {
  if (!value.trim()) {
    emitToast(`${label} ainda esta vazio.`);
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    emitToast(`${label} copiado para a area de transferencia.`);
    return true;
  } catch {
    emitToast(`Nao foi possivel copiar ${label.toLowerCase()}. Verifique a permissao do navegador.`);
    return false;
  }
}
