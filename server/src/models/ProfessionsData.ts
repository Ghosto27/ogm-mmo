import { Schema, type } from "@colyseus/schema";
import { ProfessionEntry } from "./ProfessionEntry";

export class ProfessionsData extends Schema {
    @type(ProfessionEntry) mining = new ProfessionEntry();
    @type(ProfessionEntry) blacksmithing = new ProfessionEntry();

    toJSON(): any {
        return {
            mining: this.mining.toJSON(),
            blacksmithing: this.blacksmithing.toJSON()
        };
    }

    static fromJSON(data: any): ProfessionsData {
        const pd = new ProfessionsData();
        if (data?.mining) pd.mining = ProfessionEntry.fromJSON(data.mining);
        if (data?.blacksmithing) pd.blacksmithing = ProfessionEntry.fromJSON(data.blacksmithing);
        return pd;
    }
}
