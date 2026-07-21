import { EventEmitter } from "events";

export interface StateChangeEvent {
	service: "filter" | "object" | "form" | "event" | "variable";
	action: string;
	sessionId: string;
	id: string;
	data?: any;
	timestamp: number;
}

export class CoreEventBroker extends EventEmitter {
	private static instance: CoreEventBroker;

	private constructor() {
		super();
	}

	public static getInstance(): CoreEventBroker {
		if (!CoreEventBroker.instance) {
			CoreEventBroker.instance = new CoreEventBroker();
		}
		return CoreEventBroker.instance;
	}

	public emitStateChange(event: StateChangeEvent) {
		this.emit("state:changed", event);
	}
}

export const eventBroker = CoreEventBroker.getInstance();
