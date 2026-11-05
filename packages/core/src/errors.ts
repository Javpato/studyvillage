export type ErrorCode = 'storage' | 'invalid' | 'network' | 'ai-unavailable' | 'ai-response' | 'ai-busy' | 'cancelled';
const messages: Record<ErrorCode,string> = {
 storage: 'No se pudo guardar. Conservamos lo que has escrito; revisa el espacio disponible y vuelve a intentarlo.',
 invalid: 'Revisa los campos señalados antes de continuar.',
 network: 'No se pudo conectar. Comprueba la conexión y vuelve a intentarlo.',
 'ai-unavailable': 'Ollama no está disponible. Comprueba la conexión desde su mueble de configuración.',
 'ai-response': 'El modelo no pudo completar esta tarea. Prueba de nuevo o elige otro modelo desde Configurar Ollama.',
 'ai-busy': 'Ollama está trabajando. Espera a que termine e inténtalo de nuevo.',
 cancelled: 'La operación se ha cancelado.',
};
export class AppError extends Error {
 constructor(public readonly code: ErrorCode, public readonly userMessage = messages[code]) { super(userMessage); this.name = 'AppError'; }
}
