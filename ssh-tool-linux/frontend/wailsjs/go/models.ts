export namespace app {
	
	export class ConnectionConfig {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    authType: string;
	    passwordEncrypted?: string;
	    keyEncrypted?: string;
	    keyPassEncrypted?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.authType = source["authType"];
	        this.passwordEncrypted = source["passwordEncrypted"];
	        this.keyEncrypted = source["keyEncrypted"];
	        this.keyPassEncrypted = source["keyPassEncrypted"];
	    }
	}
	export class FileEntry {
	    name: string;
	    size: number;
	    isDir: boolean;
	    modTime: number;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.isDir = source["isDir"];
	        this.modTime = source["modTime"];
	        this.mode = source["mode"];
	    }
	}

}

