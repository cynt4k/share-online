import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import { Stream, Writable } from 'stream';
import * as fs from 'fs';

export default class ShareOnline {
    private user: string;
    private password: string;


    constructor($user: string, $password: string) {
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

    public async download(url: string, streamFile: Writable): Promise<void> {
        try {
            const authStatus = await this.auth();

            if (!authStatus.premium) {
                throw new ShareOnlineError('Not premium');
            }

            if (!authStatus.token) {
                throw new ShareOnlineError('No auth token responded');
            }

            const linkStatus = await this.apiLinkCheck(url);

            if (!linkStatus.online) {
                throw new ShareOnlineError('Link is offline');
            }

            if (linkStatus.size! > authStatus.trafficLeft) {
                throw new ShareOnlineError('No traffic left');
            }

            const downloadLink = await this.getDownloadLink(linkStatus);

            const downloadStream = await fetch(downloadLink.url!, {
                method: 'GET',
                headers: { Cookie: `a=${authStatus.token}`}
            });
            downloadStream.body.pipe(streamFile);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    private async getDownloadLink(linkInfo: LinkStatus): Promise<LinkStatus> {
        const params: URLSearchParams = new URLSearchParams();
        params.append('username', this.user);
        params.append('password', this.password);
        params.append('act', 'download');
        params.append('lid', linkInfo.fileId!);

        let status: LinkStatus = <LinkStatus>{};

        try {
            const result = await fetch(`https://api.share-online.biz/account.php?${params}`, { method: 'GET' });
            const data = await result.text();
            const dataArr: Array<string> = data.substr(0, data.length - 1).split('\n');

            dataArr.forEach((dataLine) => {
                const lineArr: Array<string> = [dataLine.substr(0, dataLine.indexOf(':')), dataLine.substring(dataLine.indexOf(':') + 2)];

                switch (lineArr[0]) {
                    case 'ID': status.fileId = lineArr[1]; break;
                    case 'URL': status.url = lineArr[1]; break;
                    case 'STATUS': status.online = lineArr[1] === 'online' ? true : false; break;
                    case 'SIZE': status.size = Number(lineArr[1]); break;
                    case 'MD5': status.md5 = lineArr[1]; break;
                    default: break;
                }
            });
            return Promise.resolve(status);

        } catch (e) {
            return Promise.reject(e);
        }
    }

    public async apiLinkCheck(url: string): Promise<LinkStatus> {
        const params: URLSearchParams = new URLSearchParams();
        params.append('md5', '1');
        params.append('links', url);

        let status: LinkStatus = <LinkStatus>{};

        try {
            const result = await fetch(`https://api.share-online.biz/linkcheck.php?${params}`, { method: 'GET' });
            const data = await result.text();
            const statusString: string = data.substr(0, data.length - 1);
            const statArray: Array<string> = statusString.split(';');
            if (statArray[1] === 'OK') {
                status = {
                    fileId: statArray[0],
                    online: true,
                    name: statArray[2],
                    size: Number(statArray[3]),
                    md5: statArray[4]
                };
            } else if (['DELETED', 'NOTFOUND'].includes(statArray[1])) {
                status = {
                    online: false
                };
            }
            return Promise.resolve(status);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    public async apiMultiLinkCheck(url: string): Promise<LinkStatus[]> {
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

    private parseData(data: ApiResponse): AuthInfo {
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
            'trafficLeft': trafficLeft,
            'token': data.a
        }
    }

    public async auth(): Promise<AuthInfo> {
        try {
            const result = await this.apiResponse();
            if (!result.a) {
                return Promise.reject(new ShareOnlineError('Login failed'))
            }
            const data = this.parseData(result);
            return Promise.resolve(data);
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

export interface AuthInfo {
    premium: boolean;
    validUntil: number;
    trafficLeft: number;
    token?: string;
}

export interface LinkStatus {
    url?: string;
    fileId?: string;
    online: boolean;
    name?: string;
    size?: number;
    md5?: string;
}
