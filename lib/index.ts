import fetch from 'node-fetch';
import { URLSearchParams } from 'url';

export default class ShareOnline {
    private user: string;
    private password: string;


    constructor ($user: string, $password: string) {
        this.user = $user;
        this.password = $password;
    }

    private async apiResponse(): Promise<ApiResponse> {
        const params: URLSearchParams = new URLSearchParams();
        params.append('q', 'userdetails');
        params.append('aux', 'traffic');
        params.append('username', this.user);
        params.append('password', this.password);

        try {
            const result = await fetch(`https://api.share-online.biz/cgi-bin?${params}`, { method: 'GET' });
            const body = await result.text();
            const dataArr = body.split('\n');
            let data = <any>{};
            dataArr.forEach((dataLine) => {
                const line = dataLine.split('=');
                if (line.length !== 2) {
                    return Promise.reject(false);
                }
                data[line[0]] = line[1];
            })
            return Promise.resolve(data as ApiResponse);
        } catch (e) {
            return Promise.reject(e);
        }
     }

     public async apiLinkcheck(url: string): Promise<LinkStatus[]> {
         const params: URLSearchParams = new URLSearchParams();
         params.append('md5', '1');
         params.append('links', url);

         let status: LinkStatus[] = [];

         try {
             const result = await fetch(`https://api.share-online.biz/linkcheck.php?${params}`, { method: 'GET' });
             const data = await result.text();
             const statusArr: Array<string> = data.substr(0, data.length - 1).split('\n');
             statusArr.forEach((statusLine) => {
                 const stat: Array<string> = statusLine.split(';');
                 if (stat[1] === 'OK') {
                     status.push({
                         fileId: stat[0],
                         online: true,
                         name: stat[2],
                         size: Number(stat[3]),
                         md5: stat[4]
                     });
                 } else if (['DELETED', 'NOTFOUND'].includes(stat[1])) {
                     status.push({
                         online: false
                     });
                 }
             });
             return Promise.resolve(status);
         } catch (e) {
             return Promise.reject(e);
         }

     }

     private parseData(data: ApiResponse): Object {
         const maxTraffic = 100 * 1024 * 1024 * 1024;

         const isPremium: boolean = ['PrePaid', 'Premium', 'Penalty-Premium', 'VIP', 'VIP-Special'].includes(data.group);
         const validUntil: number = Number(data.expire_date);
         const traffic: number = Number(data['traffic_1d'].split(';')[0]);
         let trafficLeft = -1;

         if (maxTraffic > traffic && isPremium) {
             trafficLeft = maxTraffic - traffic;
         }
         return {
             'premium': isPremium,
             'validUntil': validUntil,
             'trafficLeft': trafficLeft
            }
     }

     public async auth(): Promise<boolean> {
         try {
             const result = await this.apiResponse();
             if (!result.a) {
                 return Promise.reject(new ShareOnlineError('Login failed'))
             }
             const data = this.parseData(result);
             return Promise.resolve(true);
         } catch (e) {
             return Promise.reject(e);
         }
     }
}

export class ShareOnlineError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

interface ApiResponse {
    a: string;
    email: string;
    expire_date: string;
    group: string;
    money: string;
    points: string;
    register_data: string;
    traffic_1d: string;
    traffic_7d: string;
    user: string;
}

export interface LinkStatus {
    fileId?: string;
    online: boolean;
    name?: string;
    size?: number;
    md5?: string;
}
