"""Fetch real NASA POWER daily climate data for candidate sites; no synthetic fallbacks."""
import csv,json,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sites=list(csv.DictReader(open(ROOT/'candidate_sites.csv',encoding='utf-8')))
OUT=ROOT/'data';OUT.mkdir(exist_ok=True)
PARAMS='T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PS'
fields=['site','date','latitude','longitude']+PARAMS.split(',')
rows=[];errors=[]
for site in sites:
    params={'parameters':PARAMS,'community':'AG','latitude':site['latitude'],'longitude':site['longitude'],'start':'20230101','end':'20241231','format':'JSON'}
    url='https://power.larc.nasa.gov/api/temporal/daily/point?'+urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url,timeout=120) as response: data=json.load(response)
        variables=data['properties']['parameter']
        dates=sorted(set().union(*(set(v.keys()) for v in variables.values())))
        for day in dates:
            row={'site':site['site'],'date':day,'latitude':site['latitude'],'longitude':site['longitude']}
            for p in PARAMS.split(','):
                v=variables.get(p,{}).get(day)
                row[p]=None if v is None or v<=-990 else v
            rows.append(row)
        print('Downloaded',site['site'],len(dates),'days')
    except Exception as exc:
        errors.append({'site':site['site'],'error':str(exc),'url':url})
        print('FAILED',site['site'],exc)
    time.sleep(1)
if rows:
    with open(OUT/'nasa_power_daily_2023_2024.csv','w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
    grouped={}
    for row in rows:grouped.setdefault(row['site'],[]).append(row)
    summary=[]
    for site,rs in grouped.items():
        good=lambda key:[float(r[key]) for r in rs if r[key] is not None]
        temp=good('T2M');rain=good('PRECTOTCORR');humidity=good('RH2M');wind=good('WS2M')
        summary.append({'site':site,'days_downloaded':len(rs),'mean_temp_c':round(sum(temp)/len(temp),3) if temp else None,'total_precipitation_mm_2023_2024':round(sum(rain),3) if rain else None,'mean_humidity_pct':round(sum(humidity)/len(humidity),3) if humidity else None,'mean_wind_ms':round(sum(wind)/len(wind),3) if wind else None,'source':'NASA POWER daily API','period':'2023-01-01 to 2024-12-31'})
    with open(OUT/'climate_summary.csv','w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=summary[0].keys());w.writeheader();w.writerows(summary)
    (OUT/'climate_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
(OUT/'download_errors.json').write_text(json.dumps(errors,indent=2),encoding='utf-8')
print('Done. Records:',len(rows),'Errors:',len(errors))
